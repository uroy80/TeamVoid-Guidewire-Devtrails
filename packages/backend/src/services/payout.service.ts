import { db } from '../config/database.js';
import { selectGateway, type GatewayName, type PaymentGateway } from '../external/payments/index.js';
import type { Payout } from '@gigshield/shared';
import { randomUUID } from 'crypto';
import { events } from './events.service.js';

/**
 * Instant-payout state machine.
 *
 * Lifecycle:
 *   INITIATED  → gateway call in flight (we've written the row, nothing else)
 *   PROCESSING → gateway accepted, bank-side settlement pending (~2–4 s)
 *   SUCCESS    → money landed, claim flipped to PAID, ledger entry written
 *   FAILED     → terminal after MAX_RETRIES exhausted
 *   RETRYING   → transient failure, exponential backoff scheduled
 *
 * The key design choice: we return as soon as the gateway *accepts* the
 * request (status = PROCESSING), then schedule the settlement update
 * out-of-band. That lets the admin UI show the 3-step timeline animating
 * in real time via SSE without the HTTP request hanging for 4 seconds.
 */

const MAX_RETRIES = 2;
const RETRY_BACKOFFS_MS = [1500, 4000]; // only two retries, total ~5.5 s

export interface InitiatePayoutOptions {
  /** Force a specific gateway (admin modal lets the operator pick). */
  gatewayOverride?: GatewayName;
  /** Source label for audit — "ADMIN_MANUAL" | "AUTO_APPROVAL" | "DEMO". */
  source?: string;
  /** Who triggered it (worker_id or "admin"). For audit log. */
  actorId?: string;
}

export async function initiatePayout(
  claimId: string,
  opts: InitiatePayoutOptions = {},
): Promise<Payout> {
  const claim = await db('claims').where({ id: claimId }).first();
  if (!claim) throw new Error(`Claim ${claimId} not found`);

  // Idempotency: a claim gets exactly one SUCCESS payout. If one already
  // exists, refuse to kick off a new one — the old code would silently
  // create duplicates and double-credit the ledger.
  const existing = await db('payouts')
    .where({ claim_id: claimId })
    .whereIn('status', ['SUCCESS', 'PROCESSING', 'INITIATED'])
    .first();
  if (existing) {
    return existing as Payout;
  }

  const worker = await db('workers').where({ id: claim.worker_id }).first();
  if (!worker) throw new Error(`Worker ${claim.worker_id} not found`);

  const upiId = worker.payment_upi || 'unknown@upi';
  const grossAmount = Number(claim.income_loss_payout);
  const gateway = selectGateway(upiId, opts.gatewayOverride);

  const payoutId = randomUUID();
  const now = new Date();

  // Step 1 — write an INITIATED row before we even call the gateway.
  // Emitting PAYOUT_INITIATED now means the admin UI shows step 1 lit up
  // immediately, before the ~300 ms latency of the gateway call.
  await db('payouts').insert({
    id: payoutId,
    claim_id: claimId,
    worker_id: claim.worker_id,
    amount: grossAmount,
    payment_method: gateway.paymentMethod,
    transaction_ref: null,
    status: 'INITIATED',
    retry_count: 0,
    gateway: gateway.name,
    initiated_at: now,
    created_at: now,
    updated_at: now,
  });

  try {
    events.emitEvent('PAYOUT_INITIATED', {
      payout_id: payoutId,
      claim_id: claimId,
      worker_id: claim.worker_id,
      amount: grossAmount,
      gateway: gateway.name,
      gateway_display: gateway.displayName,
      upi_id: upiId,
    });
  } catch { /* swallow */ }

  // Step 2 — fire the gateway call. `disburseWithRetries` handles transient
  // failures with backoff and writes the retry count back into the payout row.
  const outcome = await disburseWithRetries(gateway, {
    amount: grossAmount,
    upiId,
    referenceId: claimId,
    note: `GigShield claim ${claim.claim_number || claimId.slice(0, 8)}`,
  }, payoutId);

  if (outcome.kind === 'FAILED') {
    const failedAt = new Date();
    await db('payouts').where({ id: payoutId }).update({
      status: 'FAILED',
      failed_at: failedAt,
      failure_reason: outcome.reason,
      gateway_response: JSON.stringify(outcome.lastResponse),
      updated_at: failedAt,
    });

    try {
      events.emitEvent('PAYOUT_FAILED', {
        payout_id: payoutId,
        claim_id: claimId,
        worker_id: claim.worker_id,
        gateway: gateway.name,
        reason: outcome.reason,
      });
    } catch { /* swallow */ }

    await db('audit_log').insert({
      entity_type: 'payout',
      entity_id: payoutId,
      new_state: JSON.stringify({ status: 'FAILED' }),
      triggering_event: 'PAYOUT_FAILED',
      metadata: JSON.stringify({
        claimId, upiId, gateway: gateway.name,
        reason: outcome.reason,
        retries: outcome.retries,
        source: opts.source ?? 'UNKNOWN',
        actor: opts.actorId ?? 'system',
      }),
      created_at: failedAt,
    });

    return (await db('payouts').where({ id: payoutId }).first()) as Payout;
  }

  // Step 3 — gateway accepted. Flip to PROCESSING, persist fees + txn ref.
  const { result, retries } = outcome;
  const feeAmount = result.feeAmount;
  const taxAmount = result.taxAmount;
  const netAmount = Math.max(0, Math.round((grossAmount - feeAmount - taxAmount) * 100) / 100);
  const processingAt = new Date();

  await db('payouts').where({ id: payoutId }).update({
    status: 'PROCESSING',
    transaction_ref: result.transactionRef,
    utr_number: result.utrNumber,
    fee_amount: feeAmount,
    tax_amount: taxAmount,
    net_amount: netAmount,
    gateway_response: JSON.stringify(result.rawResponse),
    processing_at: processingAt,
    retry_count: retries,
    updated_at: processingAt,
  });

  try {
    events.emitEvent('PAYOUT_PROCESSING', {
      payout_id: payoutId,
      claim_id: claimId,
      worker_id: claim.worker_id,
      amount: grossAmount,
      net_amount: netAmount,
      fee_amount: feeAmount,
      tax_amount: taxAmount,
      gateway: gateway.name,
      gateway_display: gateway.displayName,
      transaction_ref: result.transactionRef,
      utr_number: result.utrNumber,
    });
  } catch { /* swallow */ }

  // Step 4 — schedule the settlement update out-of-band. The HTTP handler
  // returns immediately; the admin and worker see the timeline animate via
  // the SSE stream when this timer fires.
  scheduleSettlement(payoutId, result.settlementDelayMs, {
    claimId,
    workerId: claim.worker_id,
    gatewayName: gateway.name,
    gatewayDisplay: gateway.displayName,
    grossAmount,
    netAmount,
    feeAmount,
    taxAmount,
    transactionRef: result.transactionRef,
    utrNumber: result.utrNumber,
    upiId,
    source: opts.source ?? 'UNKNOWN',
    actorId: opts.actorId ?? 'system',
  });

  return (await db('payouts').where({ id: payoutId }).first()) as Payout;
}

// ─────────────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────────────

type DisburseOutcome =
  | {
      kind: 'ACCEPTED';
      result: Awaited<ReturnType<PaymentGateway['initiate']>>;
      retries: number;
    }
  | { kind: 'FAILED'; reason: string; retries: number; lastResponse: Record<string, unknown> };

async function disburseWithRetries(
  gateway: PaymentGateway,
  req: { amount: number; upiId: string; referenceId: string; note: string },
  payoutId: string,
): Promise<DisburseOutcome> {
  let attempt = 0;
  let lastReason = 'unknown';
  let lastResponse: Record<string, unknown> = {};

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result = await gateway.initiate(req);
    if (result.status === 'ACCEPTED') {
      return { kind: 'ACCEPTED', result, retries: attempt };
    }
    lastReason = result.failureReason ?? 'gateway rejected';
    lastResponse = result.rawResponse;

    if (attempt >= MAX_RETRIES) {
      return { kind: 'FAILED', reason: lastReason, retries: attempt, lastResponse };
    }

    // Mark the payout row as RETRYING so a concurrent observer sees the state.
    const retryAt = new Date();
    await db('payouts').where({ id: payoutId }).update({
      status: 'RETRYING',
      retry_count: attempt + 1,
      failure_reason: lastReason,
      updated_at: retryAt,
    });

    await new Promise((r) => setTimeout(r, RETRY_BACKOFFS_MS[attempt]));
    attempt += 1;
  }
}

interface SettlementContext {
  claimId: string;
  workerId: string;
  gatewayName: GatewayName;
  gatewayDisplay: string;
  grossAmount: number;
  netAmount: number;
  feeAmount: number;
  taxAmount: number;
  transactionRef: string;
  utrNumber: string | null;
  upiId: string;
  source: string;
  actorId: string;
}

function scheduleSettlement(payoutId: string, delayMs: number, ctx: SettlementContext): void {
  setTimeout(() => {
    void settle(payoutId, ctx).catch((err) => {
      console.error(`[PayoutService] settlement failed for ${payoutId}:`, err);
    });
  }, delayMs);
}

async function settle(payoutId: string, ctx: SettlementContext): Promise<void> {
  const settledAt = new Date();

  // Gate on current status — don't settle a payout that's been cancelled
  // or marked FAILED by a separate path.
  const current = await db('payouts').where({ id: payoutId }).first();
  if (!current || current.status !== 'PROCESSING') {
    console.warn(
      `[PayoutService] skip settle for ${payoutId} — current status is ${current?.status}`,
    );
    return;
  }

  await db.transaction(async (trx) => {
    await trx('payouts').where({ id: payoutId }).update({
      status: 'SUCCESS',
      settled_at: settledAt,
      updated_at: settledAt,
    });

    await trx('claims').where({ id: ctx.claimId }).update({
      status: 'PAID',
      updated_at: settledAt,
    });

    await trx('financial_ledger').insert({
      id: randomUUID(),
      worker_id: ctx.workerId,
      amount: ctx.netAmount,
      direction: 'OUTFLOW',
      type: 'PAYOUT_DISBURSEMENT',
      reference_id: ctx.claimId,
      transaction_ref: ctx.transactionRef,
      created_at: settledAt,
    });

    await trx('audit_log').insert({
      entity_type: 'payout',
      entity_id: payoutId,
      new_state: JSON.stringify({ status: 'SUCCESS' }),
      triggering_event: 'PAYOUT_DISBURSED',
      metadata: JSON.stringify({
        claimId: ctx.claimId,
        upiId: ctx.upiId,
        gateway: ctx.gatewayName,
        grossAmount: ctx.grossAmount,
        feeAmount: ctx.feeAmount,
        taxAmount: ctx.taxAmount,
        netAmount: ctx.netAmount,
        transactionRef: ctx.transactionRef,
        utrNumber: ctx.utrNumber,
        source: ctx.source,
        actor: ctx.actorId,
      }),
      created_at: settledAt,
    });
  });

  try {
    events.emitEvent('PAYOUT_SENT', {
      payout_id: payoutId,
      claim_id: ctx.claimId,
      worker_id: ctx.workerId,
      amount: ctx.grossAmount,
      net_amount: ctx.netAmount,
      fee_amount: ctx.feeAmount,
      tax_amount: ctx.taxAmount,
      gateway: ctx.gatewayName,
      gateway_display: ctx.gatewayDisplay,
      transaction_ref: ctx.transactionRef,
      utr_number: ctx.utrNumber,
      upi_id: ctx.upiId,
      status: 'SUCCESS',
    });
  } catch { /* swallow */ }
}

// ─────────────────────────────────────────────────────────────────────────
// Public reads
// ─────────────────────────────────────────────────────────────────────────

export async function getByWorker(workerId: string): Promise<Payout[]> {
  const payouts = await db('payouts')
    .where({ worker_id: workerId })
    .orderBy('created_at', 'desc');
  return payouts as Payout[];
}

export async function getByClaim(claimId: string): Promise<Payout | null> {
  const payout = await db('payouts')
    .where({ claim_id: claimId })
    .orderBy('created_at', 'desc')
    .first();
  return (payout ?? null) as Payout | null;
}

export async function getById(payoutId: string): Promise<Payout | null> {
  const payout = await db('payouts').where({ id: payoutId }).first();
  return (payout ?? null) as Payout | null;
}

// ─────────────────────────────────────────────────────────────────────────
// Back-compat alias
// The old `processPayout(claimId)` used to do a one-shot disburse and
// immediately flipped the claim to PAID. Keep a thin wrapper around the
// new state machine for any caller (demo.routes, tests) that still uses
// the old name.
// ─────────────────────────────────────────────────────────────────────────

export async function processPayout(claimId: string): Promise<Payout> {
  return initiatePayout(claimId, { source: 'LEGACY_PROCESS_PAYOUT' });
}
