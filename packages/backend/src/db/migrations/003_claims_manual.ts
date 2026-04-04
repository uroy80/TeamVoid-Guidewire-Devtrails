import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('claims', (t) => {
    t.enum('source', ['AUTO', 'MANUAL']).defaultTo('AUTO');
    t.text('description').nullable();
    t.string('request_device_fingerprint', 256).nullable();
    t.decimal('request_latitude', 10, 6).nullable();
    t.decimal('request_longitude', 10, 6).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('claims', (t) => {
    t.dropColumn('source');
    t.dropColumn('description');
    t.dropColumn('request_device_fingerprint');
    t.dropColumn('request_latitude');
    t.dropColumn('request_longitude');
  });
}
