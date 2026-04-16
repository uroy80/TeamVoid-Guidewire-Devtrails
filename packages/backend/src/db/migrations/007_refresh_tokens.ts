import type { Knex } from 'knex';

/**
 * Phase 4b — Refresh-token rotation with reuse detection.
 *
 * Each refresh token belongs to a *family* (a login session). When a token
 * is rotated, the prior token is marked revoked. If a revoked token is ever
 * presented again we revoke the entire family — classic OAuth2
 * reuse-detection flow.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('refresh_tokens', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('worker_id').notNullable();
    t.uuid('family_id').notNullable();
    t.string('token_hash', 128).notNullable().unique();
    t.timestamp('issued_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('expires_at', { useTz: true }).notNullable();
    t.timestamp('revoked_at', { useTz: true }).nullable();

    t.index(['worker_id']);
    t.index(['family_id']);
    t.index(['token_hash']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('refresh_tokens');
}
