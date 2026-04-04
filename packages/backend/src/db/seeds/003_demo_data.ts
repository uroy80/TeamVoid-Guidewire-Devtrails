import type { Knex } from 'knex';
import { v4 as uuid } from 'uuid';

export async function seed(knex: Knex): Promise<void> {
  // Get demo worker (Usham Roy - BLK-R001)
  const worker = await knex('workers').where({ mobile: '7001989183' }).first();
  if (!worker) {
    console.warn('Demo worker not found, skipping demo data');
    return;
  }

  const zone = await knex('delivery_zones').where({ id: worker.delivery_zone_id }).first();

  // Create an active policy for the demo worker
  const policyId = uuid();
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  await knex('policies').insert({
    id: policyId,
    policy_number: 'GS-100001',
    worker_id: worker.id,
    coverage_level: 'standard',
    coverage_period_start: now,
    coverage_period_end: weekFromNow,
    weekly_premium: 89,
    premium_breakdown: JSON.stringify({
      basePremium: 35,
      riskFactor: 1.66,
      coverageMultiplier: 1.2,
      loyaltyDiscount: true,
      finalPremium: 89,
    }),
    status: 'ACTIVE',
    auto_renew: true,
    payment_transaction_ref: 'TXN-DEMO1',
  });

  // Create a financial ledger entry for the premium payment
  await knex('financial_ledger').insert({
    worker_id: worker.id,
    amount: 89,
    direction: 'INFLOW',
    type: 'PREMIUM_PAYMENT',
    reference_id: policyId,
    transaction_ref: 'TXN-DEMO1',
  });

  // Create a past disruption event (heavy rain, already resolved)
  const pastEventId = uuid();
  const pastDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000); // 3 days ago

  await knex('disruption_events').insert({
    id: pastEventId,
    event_type: 'HEAVY_RAINFALL',
    severity: 'SEVERE',
    delivery_zone_id: zone.id,
    affected_dark_store_ids: '{}',
    duration_estimate_hours: 8,
    source_data: JSON.stringify({
      rainfall_mm: 78,
      source: 'OpenWeatherMap',
      temp: 28,
    }),
    verified_by_sources: '{OpenWeatherMap}',
    event_timestamp: pastDate,
  });

  // Create a paid claim for the past event
  const claimId = uuid();
  const payoutAmount = Math.round(8 * worker.hourly_rate * 0.75); // 8 hrs x hourly x 75%

  await knex('claims').insert({
    id: claimId,
    claim_number: 'CLM-100001',
    policy_id: policyId,
    worker_id: worker.id,
    disruption_event_id: pastEventId,
    status: 'PAID',
    disruption_hours: 8,
    estimated_hourly_earnings: worker.hourly_rate,
    coverage_level_pct: 0.75,
    income_loss_payout: payoutAmount,
    fraud_score: 12,
    fraud_check_details: JSON.stringify({
      bas_score: 88,
      gps_authenticity: 95,
      movement_entropy: 82,
      device_consistency: 100,
      historical_behavior: 85,
      ring_fraud_absence: 100,
      weather_correlation: 100,
      flags: [],
      tier: 'GREEN',
    }),
  });

  // Create payout for the claim
  await knex('payouts').insert({
    claim_id: claimId,
    worker_id: worker.id,
    amount: payoutAmount,
    payment_method: 'UPI',
    transaction_ref: 'RZP-DEMO1',
    status: 'SUCCESS',
  });

  // Create financial ledger entry for payout
  await knex('financial_ledger').insert({
    worker_id: worker.id,
    amount: payoutAmount,
    direction: 'OUTFLOW',
    type: 'PAYOUT_DISBURSEMENT',
    reference_id: claimId,
    transaction_ref: 'RZP-DEMO1',
  });

  // Create some location log entries for the demo worker (realistic GPS data)
  const locations = [
    { lat: 22.5795, lng: 88.4175, hours_ago: 2 },
    { lat: 22.5798, lng: 88.4178, hours_ago: 1.5 },
    { lat: 22.5802, lng: 88.4172, hours_ago: 1 },
    { lat: 22.5800, lng: 88.4180, hours_ago: 0.5 },
    { lat: 22.5797, lng: 88.4176, hours_ago: 0 },
  ];

  for (const loc of locations) {
    await knex('worker_location_log').insert({
      worker_id: worker.id,
      latitude: loc.lat,
      longitude: loc.lng,
      accuracy_meters: 15,
      source: 'GPS',
      device_fingerprint: 'demo-device-001',
      recorded_at: new Date(now.getTime() - loc.hours_ago * 60 * 60 * 1000),
    });
  }

  // Create device fingerprint for demo worker
  await knex('device_fingerprints').insert({
    worker_id: worker.id,
    fingerprint_hash: 'demo-device-001',
    user_agent: 'Mozilla/5.0 (Linux; Android 13; Pixel 6)',
    screen_resolution: '1080x2400',
    timezone_offset: -330,
    language: 'en',
  });

  // Create audit log entries
  await knex('audit_log').insert([
    {
      entity_type: 'POLICY',
      entity_id: policyId,
      previous_state: 'PENDING_PAYMENT',
      new_state: 'ACTIVE',
      triggering_event: 'PAYMENT_RECEIVED',
      metadata: JSON.stringify({ transaction_ref: 'TXN-DEMO1' }),
    },
    {
      entity_type: 'CLAIM',
      entity_id: claimId,
      previous_state: 'CREATED',
      new_state: 'PAID',
      triggering_event: 'AUTO_APPROVED_AND_PAID',
      metadata: JSON.stringify({ bas_score: 88, fraud_tier: 'GREEN' }),
    },
  ]);

  console.log(`Demo data seeded: Policy ${policyId}, Claim ${claimId}, Payout ₹${payoutAmount}`);
}
