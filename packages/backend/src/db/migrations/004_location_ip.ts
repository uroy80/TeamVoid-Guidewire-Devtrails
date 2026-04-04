import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('worker_location_log', (table) => {
    table.string('ip_address', 45).nullable(); // IPv4 or IPv6
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('worker_location_log', (table) => {
    table.dropColumn('ip_address');
  });
}
