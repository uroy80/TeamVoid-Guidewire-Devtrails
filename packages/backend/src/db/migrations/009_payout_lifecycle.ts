import type { Knex } from 'knex';

/**
 * Phase 5: Instant payout — the "war room" upgrade.
 *
 * Turns the single-row payouts table into a first-class audit trail of a
 * payment's journey through a (mocked) gateway. New columns let the admin UI
 * render a live timeline and let the worker see a gateway-branded receipt.
 *
 *   gateway          — which simulator handled it: RAZORPAY | STRIPE | UPI
 *   utr_number       — NPCI-style 12-digit Unique Transaction Reference
 *   fee_amount       — what the gateway charges (0.25%–0.5% on real providers)
 *   tax_amount       — GST @ 18% applied on the fee (India-specific)
 *   net_amount       — amount - fee - tax  (what actually reaches the UPI VPA)
 *   gateway_response — full JSON the gateway returned; kept for audit
 *   failure_reason   — human-readable reason when status = FAILED
 *   initiated_at     — server accepted the disburse request
 *   processing_at    — gateway accepted and is contacting the bank
 *   settled_at       — money actually hit the beneficiary
 *   failed_at        — terminal failure after retries exhausted
 *
 * All new columns are nullable for backward compatibility with the existing
 * rows inserted by the old single-step processPayout().
 */
export async function up(knex: Knex): Promise<void> {
  const hasGateway = await knex.schema.hasColumn('payouts', 'gateway');
  if (!hasGateway) {
    await knex.schema.alterTable('payouts', (t) => {
      t.string('gateway', 24).nullable();              // RAZORPAY | STRIPE | UPI
      t.string('utr_number', 32).nullable();
      t.decimal('fee_amount', 10, 2).nullable();
      t.decimal('tax_amount', 10, 2).nullable();
      t.decimal('net_amount', 10, 2).nullable();
      t.jsonb('gateway_response').nullable();
      t.text('failure_reason').nullable();
      t.timestamp('initiated_at', { useTz: true }).nullable();
      t.timestamp('processing_at', { useTz: true }).nullable();
      t.timestamp('settled_at', { useTz: true }).nullable();
      t.timestamp('failed_at', { useTz: true }).nullable();

      // Common access pattern: "all payouts for claim X" (already unique on
      // claim_id from 001). Add a status index for admin dashboards that
      // filter by PROCESSING/SUCCESS/FAILED.
      t.index(['status', 'created_at']);
      t.index(['gateway']);
    });
  }

  // The original payouts.status enum from 001 only has INITIATED/SUCCESS/FAILED/RETRYING.
  // We need PROCESSING as an intermediate. Keep it as varchar-backed CHECK
  // (knex enum is a CHECK constraint under the hood in Postgres) — simplest
  // portable way: drop and recreate the column-level check.
  //
  // Postgres lets us just add a new allowed value via raw SQL when the enum
  // was created by knex's default string+check path. If it was a native
  // pgenum, we'd ALTER TYPE ADD VALUE. The 001 migration uses t.enum() which
  // by default creates a CHECK constraint on a VARCHAR. So we drop the old
  // constraint and add a broader one.
  await knex.raw(`
    DO $$
    DECLARE
      constraint_name text;
    BEGIN
      SELECT conname INTO constraint_name
      FROM pg_constraint
      WHERE conrelid = 'payouts'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%status%';

      IF constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE payouts DROP CONSTRAINT ' || quote_ident(constraint_name);
      END IF;

      ALTER TABLE payouts
        ADD CONSTRAINT payouts_status_check
        CHECK (status IN ('INITIATED', 'PROCESSING', 'SUCCESS', 'FAILED', 'RETRYING'));
    END$$;
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Restore the original narrower check constraint
  await knex.raw(`
    DO $$
    DECLARE
      constraint_name text;
    BEGIN
      SELECT conname INTO constraint_name
      FROM pg_constraint
      WHERE conrelid = 'payouts'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%status%';

      IF constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE payouts DROP CONSTRAINT ' || quote_ident(constraint_name);
      END IF;

      ALTER TABLE payouts
        ADD CONSTRAINT payouts_status_check
        CHECK (status IN ('INITIATED', 'SUCCESS', 'FAILED', 'RETRYING'));
    END$$;
  `);

  const hasGateway = await knex.schema.hasColumn('payouts', 'gateway');
  if (hasGateway) {
    await knex.schema.alterTable('payouts', (t) => {
      t.dropColumn('gateway');
      t.dropColumn('utr_number');
      t.dropColumn('fee_amount');
      t.dropColumn('tax_amount');
      t.dropColumn('net_amount');
      t.dropColumn('gateway_response');
      t.dropColumn('failure_reason');
      t.dropColumn('initiated_at');
      t.dropColumn('processing_at');
      t.dropColumn('settled_at');
      t.dropColumn('failed_at');
    });
  }
}
