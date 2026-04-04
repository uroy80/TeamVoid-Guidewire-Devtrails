import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Enable UUID extension
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  // Delivery Zones
  await knex.schema.createTable('delivery_zones', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.string('pin_code', 10).notNullable();
    t.string('name', 100).notNullable();
    t.string('city', 50).notNullable();
    t.string('state', 50).notNullable();
    t.decimal('latitude', 10, 6).notNullable();
    t.decimal('longitude', 10, 6).notNullable();
    t.integer('base_risk').notNullable().defaultTo(50);
    t.timestamps(true, true);
    t.unique(['city', 'name']);
  });

  // Dark Stores
  await knex.schema.createTable('dark_stores', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.string('store_code', 20).notNullable().unique();
    t.string('name', 100).notNullable();
    t.uuid('delivery_zone_id').notNullable().references('id').inTable('delivery_zones').onDelete('CASCADE');
    t.enum('platform', ['blinkit', 'zepto', 'instamart']).notNullable();
    t.decimal('latitude', 10, 6).notNullable();
    t.decimal('longitude', 10, 6).notNullable();
    t.timestamps(true, true);
  });

  // Workers
  await knex.schema.createTable('workers', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.string('name', 100).notNullable();
    t.string('mobile', 15).notNullable().unique();
    t.string('aadhaar_hash', 256).nullable();
    t.enum('platform', ['blinkit', 'zepto', 'instamart']).notNullable();
    t.uuid('dark_store_id').nullable().references('id').inTable('dark_stores');
    t.uuid('delivery_zone_id').notNullable().references('id').inTable('delivery_zones');
    t.integer('avg_weekly_deliveries').defaultTo(0);
    t.decimal('avg_daily_earnings', 10, 2).defaultTo(0);
    t.decimal('avg_hours_per_day', 4, 1).defaultTo(8);
    t.decimal('hourly_rate', 8, 2).defaultTo(100);
    t.decimal('platform_rating', 3, 2).defaultTo(4.0);
    t.integer('risk_score').defaultTo(50);
    t.enum('risk_tier', ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).defaultTo('MEDIUM');
    t.boolean('is_verified').defaultTo(false);
    t.boolean('exclusions_acknowledged').defaultTo(false);
    t.string('payment_upi', 100).nullable();
    t.timestamps(true, true);
  });

  // OTP Records
  await knex.schema.createTable('otp_records', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.string('mobile', 15).notNullable();
    t.string('otp_hash', 256).notNullable();
    t.integer('attempts').defaultTo(0);
    t.timestamp('expires_at').notNullable();
    t.boolean('verified').defaultTo(false);
    t.timestamps(true, true);
    t.index('mobile');
  });

  // Policies
  await knex.schema.createTable('policies', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.string('policy_number', 20).notNullable().unique();
    t.uuid('worker_id').notNullable().references('id').inTable('workers').onDelete('CASCADE');
    t.enum('coverage_level', ['basic', 'standard', 'premium']).notNullable();
    t.timestamp('coverage_period_start').notNullable();
    t.timestamp('coverage_period_end').notNullable();
    t.decimal('weekly_premium', 8, 2).notNullable();
    t.jsonb('premium_breakdown').notNullable();
    t.enum('status', ['PENDING_PAYMENT', 'ACTIVE', 'EXPIRED', 'CANCELLED']).notNullable().defaultTo('PENDING_PAYMENT');
    t.boolean('auto_renew').defaultTo(true);
    t.string('payment_transaction_ref', 100).nullable();
    t.timestamps(true, true);
    t.index(['worker_id', 'status']);
  });

  // Disruption Events
  await knex.schema.createTable('disruption_events', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.enum('event_type', ['EXTREME_HEAT', 'HEAVY_RAINFALL', 'FLOODING', 'SEVERE_POLLUTION', 'SOCIAL_DISRUPTION']).notNullable();
    t.enum('severity', ['MODERATE', 'SEVERE', 'EXTREME']).notNullable();
    t.uuid('delivery_zone_id').notNullable().references('id').inTable('delivery_zones');
    t.specificType('affected_dark_store_ids', 'uuid[]').defaultTo('{}');
    t.decimal('duration_estimate_hours', 4, 1).notNullable();
    t.jsonb('source_data').defaultTo('{}');
    t.specificType('verified_by_sources', 'text[]').defaultTo('{}');
    t.timestamp('event_timestamp').notNullable();
    t.timestamps(true, true);
    t.index(['delivery_zone_id', 'event_type', 'event_timestamp']);
  });

  // Claims
  await knex.schema.createTable('claims', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.string('claim_number', 20).notNullable().unique();
    t.uuid('policy_id').notNullable().references('id').inTable('policies');
    t.uuid('worker_id').notNullable().references('id').inTable('workers');
    t.uuid('disruption_event_id').notNullable().references('id').inTable('disruption_events');
    t.enum('status', ['CREATED', 'VALIDATING', 'APPROVED', 'UNDER_REVIEW', 'REJECTED', 'PAID']).notNullable().defaultTo('CREATED');
    t.decimal('disruption_hours', 4, 1).notNullable();
    t.decimal('estimated_hourly_earnings', 8, 2).notNullable();
    t.decimal('coverage_level_pct', 3, 2).notNullable();
    t.decimal('income_loss_payout', 10, 2).notNullable();
    t.integer('fraud_score').defaultTo(0);
    t.jsonb('fraud_check_details').nullable();
    t.text('rejection_reason').nullable();
    t.timestamps(true, true);
    t.index(['worker_id', 'status']);
    t.index('disruption_event_id');
  });

  // Payouts
  await knex.schema.createTable('payouts', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('claim_id').notNullable().unique().references('id').inTable('claims');
    t.uuid('worker_id').notNullable().references('id').inTable('workers');
    t.decimal('amount', 10, 2).notNullable();
    t.string('payment_method', 20).defaultTo('UPI');
    t.string('transaction_ref', 100).nullable();
    t.enum('status', ['INITIATED', 'SUCCESS', 'FAILED', 'RETRYING']).notNullable().defaultTo('INITIATED');
    t.integer('retry_count').defaultTo(0);
    t.timestamps(true, true);
    t.index('worker_id');
  });

  // Financial Ledger
  await knex.schema.createTable('financial_ledger', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('worker_id').notNullable().references('id').inTable('workers');
    t.decimal('amount', 10, 2).notNullable();
    t.enum('direction', ['INFLOW', 'OUTFLOW']).notNullable();
    t.enum('type', ['PREMIUM_PAYMENT', 'PAYOUT_DISBURSEMENT']).notNullable();
    t.uuid('reference_id').notNullable();
    t.string('transaction_ref', 100).nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index('worker_id');
  });

  // Audit Log
  await knex.schema.createTable('audit_log', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.string('entity_type', 50).notNullable();
    t.uuid('entity_id').notNullable();
    t.text('previous_state').nullable();
    t.text('new_state').notNullable();
    t.string('triggering_event', 100).notNullable();
    t.jsonb('metadata').defaultTo('{}');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['entity_type', 'entity_id']);
    t.index('created_at');
  });

  // Anti-Spoofing: Worker Location Log
  await knex.schema.createTable('worker_location_log', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('worker_id').notNullable().references('id').inTable('workers').onDelete('CASCADE');
    t.decimal('latitude', 10, 6).notNullable();
    t.decimal('longitude', 10, 6).notNullable();
    t.decimal('accuracy_meters', 8, 2).defaultTo(0);
    t.enum('source', ['GPS', 'NETWORK', 'IP']).defaultTo('GPS');
    t.string('device_fingerprint', 256).nullable();
    t.timestamp('recorded_at').notNullable().defaultTo(knex.fn.now());
    t.index(['worker_id', 'recorded_at']);
  });

  // Anti-Spoofing: Device Fingerprints
  await knex.schema.createTable('device_fingerprints', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('worker_id').notNullable().references('id').inTable('workers').onDelete('CASCADE');
    t.string('fingerprint_hash', 256).notNullable();
    t.text('user_agent').nullable();
    t.string('screen_resolution', 20).nullable();
    t.integer('timezone_offset').nullable();
    t.string('language', 10).nullable();
    t.timestamp('first_seen_at').defaultTo(knex.fn.now());
    t.timestamp('last_seen_at').defaultTo(knex.fn.now());
    t.index(['worker_id', 'fingerprint_hash']);
    t.index('fingerprint_hash');
  });
}

export async function down(knex: Knex): Promise<void> {
  const tables = [
    'device_fingerprints',
    'worker_location_log',
    'audit_log',
    'financial_ledger',
    'payouts',
    'claims',
    'disruption_events',
    'policies',
    'otp_records',
    'workers',
    'dark_stores',
    'delivery_zones',
  ];
  for (const table of tables) {
    await knex.schema.dropTableIfExists(table);
  }
}
