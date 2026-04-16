import { db } from '../config/database.js';
import { disburse } from '../external/razorpay.mock.js';
import type { Payout } from '@gigshield/shared';
import { randomUUID } from 'crypto';
import { events } from './events.service.js';

export async function processPayout(claimId: string): Promise<Payout> {
  const claim = await db('claims').where({ id: claimId }).first();
  if (!claim) throw new Error(`Claim ${claimId} not found`);

  const worker = await db('workers').where({ id: claim.worker_id }).first();
  if (!worker) throw new Error(`Worker ${claim.worker_id} not found`);

  const upiId = worker.payment_upi || 'unknown@upi';
  const amount = Number(claim.income_loss_payout);

  // Call mock Razorpay
  const result = await disburse(amount, upiId);

  const payoutId = randomUUID();
  const now = new Date();

  await db('payouts').insert({
    id: payoutId,
    claim_id: claimId,
    worker_id: claim.worker_id,
    amount,
    payment_method: 'UPI',
    transaction_ref: result.transactionRef,
    status: result.success ? 'SUCCESS' : 'FAILED',
    retry_count: 0,
    created_at: now,
    updated_at: now,
  });

  if (result.success) {
    // Update claim to PAID
    await db('claims').where({ id: claimId }).update({
      status: 'PAID',
      updated_at: now,
    });

    // Financial ledger entry
    await db('financial_ledger').insert({
      id: randomUUID(),
      worker_id: claim.worker_id,
      amount,
      direction: 'OUTFLOW',
      type: 'PAYOUT_DISBURSEMENT',
      reference_id: claimId,
      transaction_ref: result.transactionRef,
      created_at: now,
    });

    // Audit log
    await db('audit_log').insert({
      entity_type: 'payout',
      entity_id: payoutId,
      new_state: JSON.stringify({ success: result.success }),
      triggering_event: 'PAYOUT_DISBURSED',
      metadata: JSON.stringify({
        claimId,
        amount,
        upiId,
        transactionRef: result.transactionRef,
      }),
      created_at: now,
    });
  } else {
    console.error(
      `[PayoutService] Disbursement failed for claim ${claimId}: ${result.error}`
    );
  }

  const payout = await db('payouts').where({ id: payoutId }).first();

  try {
    events.emitEvent('PAYOUT_SENT', {
      claim_id: claimId,
      amount,
      status: result.success ? 'SUCCESS' : 'FAILED',
      transaction_ref: result.transactionRef,
      worker_id: claim.worker_id,
    });
  } catch {}

  return payout as Payout;
}

export async function getByWorker(workerId: string): Promise<Payout[]> {
  const payouts = await db('payouts')
    .where({ worker_id: workerId })
    .orderBy('created_at', 'desc');
  return payouts as Payout[];
}
