import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Expand store_code to accommodate longer IDs (e.g. ZPT-{uuid})
  await knex.schema.alterTable('dark_stores', (t) => {
    t.string('city', 100).nullable();
    t.string('state', 100).nullable();
    t.string('locality', 200).nullable();
    t.decimal('accuracy_meters', 10, 2).nullable();
    t.string('source_platform', 20).nullable();
  });

  // Widen store_code from 20 to 50 chars for UUID-based codes
  await knex.raw('ALTER TABLE dark_stores ALTER COLUMN store_code TYPE varchar(50)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('dark_stores', (t) => {
    t.dropColumn('city');
    t.dropColumn('state');
    t.dropColumn('locality');
    t.dropColumn('accuracy_meters');
    t.dropColumn('source_platform');
  });

  await knex.raw('ALTER TABLE dark_stores ALTER COLUMN store_code TYPE varchar(20)');
}
