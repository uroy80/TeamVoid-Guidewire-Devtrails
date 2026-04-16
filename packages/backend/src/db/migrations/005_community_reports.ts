import type { Knex } from 'knex';

/**
 * Phase 3: Community hyperlocal reports.
 *
 * Workers on the ground see flooding/heat/strikes before weather APIs catch up.
 * When 3+ workers within 2km report the same condition within 15 min, we create
 * a provisional disruption event. When a weather API later confirms, reporters
 * get a Trust Score boost. This turns the worker base into a distributed
 * sensor network that reinforces the parametric engine.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('community_reports', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('worker_id').notNullable().references('id').inTable('workers').onDelete('CASCADE');
    t.decimal('latitude', 10, 6).notNullable();
    t.decimal('longitude', 10, 6).notNullable();
    t.enu('condition_type', ['RAIN', 'FLOOD', 'HEAT', 'POLLUTION', 'STRIKE'], {
      useNative: true,
      enumName: 'community_condition_type',
    }).notNullable();
    t.enu('severity', ['MILD', 'MODERATE', 'SEVERE'], {
      useNative: true,
      enumName: 'community_severity',
    }).notNullable().defaultTo('MODERATE');
    t.text('notes').nullable();
    t.boolean('verified').notNullable().defaultTo(false);
    t.uuid('disruption_event_id').nullable().references('id').inTable('disruption_events').onDelete('SET NULL');
    t.string('ip_address', 45).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(['worker_id']);
    t.index(['condition_type', 'created_at']);
    t.index(['verified']);
  });

  // Add trust_score to workers table (0-100, starts at 50)
  const hasTrust = await knex.schema.hasColumn('workers', 'trust_score');
  if (!hasTrust) {
    await knex.schema.alterTable('workers', (t) => {
      t.integer('trust_score').notNullable().defaultTo(50);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('community_reports');
  await knex.raw('DROP TYPE IF EXISTS community_condition_type');
  await knex.raw('DROP TYPE IF EXISTS community_severity');

  const hasTrust = await knex.schema.hasColumn('workers', 'trust_score');
  if (hasTrust) {
    await knex.schema.alterTable('workers', (t) => {
      t.dropColumn('trust_score');
    });
  }
}
