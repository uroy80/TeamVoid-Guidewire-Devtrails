import type { Knex } from 'knex';

/**
 * Phase 4a — Enterprise RBAC + tamper-evident audit log.
 *
 *  - Adds a native Postgres enum `worker_role` and `workers.role` column.
 *  - Back-fills the existing hardcoded admin user (mobile='admin' / id='admin')
 *    and any worker flagged as admin-ish to the ADMIN role.
 *  - Extends `audit_log` with `prev_hash` / `row_hash` to support a
 *    hash-chain that lets us detect silent tampering of historical rows.
 */

const ROLES = [
  'WORKER',
  'ADMIN',
  'CLAIMS_ANALYST',
  'UNDERWRITER',
  'FRAUD_OPS',
  'COMPLIANCE',
  'READ_ONLY',
] as const;

export async function up(knex: Knex): Promise<void> {
  // --- worker_role enum + workers.role column --------------------------------
  const quoted = ROLES.map((r) => `'${r}'`).join(', ');
  await knex.raw(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'worker_role') THEN
        CREATE TYPE worker_role AS ENUM (${quoted});
      END IF;
    END $$;
  `);

  const hasRole = await knex.schema.hasColumn('workers', 'role');
  if (!hasRole) {
    await knex.raw(`ALTER TABLE workers ADD COLUMN role worker_role NOT NULL DEFAULT 'WORKER'`);
  }

  // Best-effort backfill: mark anyone whose mobile hints at admin as ADMIN.
  // The hardcoded admin login uses workerId='admin', so we also try that.
  await knex.raw(`UPDATE workers SET role = 'ADMIN' WHERE mobile ILIKE '%admin%' OR id::text = 'admin'`);

  // --- audit_log hash-chain columns -----------------------------------------
  const hasPrev = await knex.schema.hasColumn('audit_log', 'prev_hash');
  const hasRow = await knex.schema.hasColumn('audit_log', 'row_hash');
  if (!hasPrev || !hasRow) {
    await knex.schema.alterTable('audit_log', (t) => {
      if (!hasPrev) t.text('prev_hash').nullable();
      if (!hasRow) t.text('row_hash').nullable();
    });
  }

  await knex.raw('CREATE INDEX IF NOT EXISTS audit_log_row_hash_idx ON audit_log(row_hash)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS audit_log_row_hash_idx');

  const hasRow = await knex.schema.hasColumn('audit_log', 'row_hash');
  const hasPrev = await knex.schema.hasColumn('audit_log', 'prev_hash');
  if (hasRow || hasPrev) {
    await knex.schema.alterTable('audit_log', (t) => {
      if (hasRow) t.dropColumn('row_hash');
      if (hasPrev) t.dropColumn('prev_hash');
    });
  }

  const hasRoleCol = await knex.schema.hasColumn('workers', 'role');
  if (hasRoleCol) {
    await knex.schema.alterTable('workers', (t) => {
      t.dropColumn('role');
    });
  }
  await knex.raw('DROP TYPE IF EXISTS worker_role');
}
