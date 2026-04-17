import type { Knex } from 'knex';

/**
 * Phase 3: Ring-fraud hardening.
 *
 * What this unlocks:
 *  - `worker_ip_log` — the table `fraud.service.computeMlVelocity` already
 *    tries to read (and silently returns 0 when absent). Creating it turns
 *    on cross-worker IP correlation as a real ML feature.
 *  - `community_reports.device_fingerprint` — the cluster detector currently
 *    requires distinct IPs. A single phone on 3 Wi-Fi networks passes that
 *    check; requiring distinct *devices* closes the loophole.
 *  - `claims.request_ip` — carry the IP that requested a MANUAL claim on
 *    the claim row itself (not just in worker_location_log) so admins can
 *    see it without a join.
 *  - An index on `workers.payment_upi` — makes the UPI-collision lookup
 *    cheap enough to run on every policy creation / fraud check.
 */
export async function up(knex: Knex): Promise<void> {
  // ── worker_ip_log ───────────────────────────────────────────────────
  const hasIpLog = await knex.schema.hasTable('worker_ip_log');
  if (!hasIpLog) {
    await knex.schema.createTable('worker_ip_log', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      t.uuid('worker_id')
        .notNullable()
        .references('id')
        .inTable('workers')
        .onDelete('CASCADE');
      t.string('ip_address', 45).notNullable(); // IPv4 or IPv6
      t.text('user_agent').nullable();
      t.string('route', 100).nullable(); // e.g. 'POST /api/claims/request' — helps an admin see intent
      t.timestamp('first_seen_at', { useTz: true })
        .notNullable()
        .defaultTo(knex.fn.now());
      t.timestamp('last_seen_at', { useTz: true })
        .notNullable()
        .defaultTo(knex.fn.now());
      t.integer('seen_count').notNullable().defaultTo(1);

      // Primary access patterns:
      //  1. "all IPs for worker X in the last N days"         → (worker_id, last_seen_at)
      //  2. "all workers seen on IP Y in the last N days"     → (ip_address, last_seen_at)
      //  3. Upsert by (worker_id, ip_address)                  → unique
      t.unique(['worker_id', 'ip_address']);
      t.index(['worker_id', 'last_seen_at']);
      t.index(['ip_address', 'last_seen_at']);
    });
  }

  // ── community_reports.device_fingerprint ────────────────────────────
  const hasCrDevice = await knex.schema.hasColumn(
    'community_reports',
    'device_fingerprint',
  );
  if (!hasCrDevice) {
    await knex.schema.alterTable('community_reports', (t) => {
      t.string('device_fingerprint', 256).nullable();
      t.index(['device_fingerprint']);
    });
  }

  // ── claims.request_ip ───────────────────────────────────────────────
  const hasClaimIp = await knex.schema.hasColumn('claims', 'request_ip');
  if (!hasClaimIp) {
    await knex.schema.alterTable('claims', (t) => {
      t.string('request_ip', 45).nullable();
    });
  }

  // ── workers.payment_upi index ───────────────────────────────────────
  // Can't use knex `index()` for a conditional unique-ish index, so do a
  // raw IF NOT EXISTS. We deliberately DO NOT make it UNIQUE — two accounts
  // on the same UPI is exactly the signal we want to *observe*, not block
  // at the DB layer. Enforcement happens in linkage.service.
  await knex.raw(
    `CREATE INDEX IF NOT EXISTS idx_workers_payment_upi ON workers (payment_upi)`,
  );

  // ── device_fingerprints.fingerprint_hash + worker cross-lookup ──────
  // 001 already indexed (worker_id, fingerprint_hash) and (fingerprint_hash).
  // Nothing to add here — cross-worker lookups are already fast.
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS idx_workers_payment_upi`);

  const hasClaimIp = await knex.schema.hasColumn('claims', 'request_ip');
  if (hasClaimIp) {
    await knex.schema.alterTable('claims', (t) => {
      t.dropColumn('request_ip');
    });
  }

  const hasCrDevice = await knex.schema.hasColumn(
    'community_reports',
    'device_fingerprint',
  );
  if (hasCrDevice) {
    await knex.schema.alterTable('community_reports', (t) => {
      t.dropColumn('device_fingerprint');
    });
  }

  await knex.schema.dropTableIfExists('worker_ip_log');
}
