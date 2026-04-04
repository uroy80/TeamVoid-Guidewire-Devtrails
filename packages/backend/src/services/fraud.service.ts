import { db } from '../config/database.js';
import { haversineDistance, TRIGGER_THRESHOLDS } from '@gigshield/shared';
import type { Claim, FraudCheckDetails, DisruptionType } from '@gigshield/shared';
import { randomUUID } from 'crypto';
import { analyzeWorkerBehavior } from './antispoofing.service.js';

interface FraudResult {
  claimId: string;
  fraud_score: number;
  status: string;
  tier: 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';
  details: FraudCheckDetails;
}

export async function checkClaim(claimId: string, source?: 'AUTO' | 'MANUAL' | 'ADMIN_TRIGGER'): Promise<FraudResult> {
  const claim = await db('claims').where({ id: claimId }).first();
  if (!claim) throw new Error(`Claim ${claimId} not found`);

  const worker = await db('workers').where({ id: claim.worker_id }).first();
  if (!worker) throw new Error(`Worker ${claim.worker_id} not found`);

  const event = await db('disruption_events')
    .where({ id: claim.disruption_event_id })
    .first();
  if (!event) throw new Error(`Event ${claim.disruption_event_id} not found`);

  const zone = await db('delivery_zones')
    .where({ id: event.delivery_zone_id })
    .first();

  const flags: string[] = [];
  let fraudScore = 0;

  // ---- 1. GPS check ----
  const latestLocation = await db('worker_location_log')
    .where({ worker_id: claim.worker_id })
    .orderBy('recorded_at', 'desc')
    .first();

  let gpsSuspicious = false;
  if (!latestLocation) {
    flags.push('NO_LOCATION_DATA');
    fraudScore += 15;
  } else if (zone) {
    const distance = haversineDistance(
      latestLocation.latitude,
      latestLocation.longitude,
      zone.latitude,
      zone.longitude
    );
    if (distance > 5) {
      flags.push(`GPS_FAR_FROM_ZONE: ${distance.toFixed(1)}km`);
      gpsSuspicious = true;
      fraudScore += 30;
    }
  }

  // ---- 2. Duplicate check ----
  const policy = await db('policies').where({ id: claim.policy_id }).first();
  let duplicateFound = false;
  if (policy) {
    const duplicateClaim = await db('claims')
      .where({ worker_id: claim.worker_id })
      .where('id', '!=', claimId)
      .whereIn('disruption_event_id', function () {
        this.select('id')
          .from('disruption_events')
          .where('event_type', event.event_type);
      })
      .where('created_at', '>=', policy.coverage_period_start)
      .where('created_at', '<=', policy.coverage_period_end)
      .first();

    if (duplicateClaim) {
      flags.push('DUPLICATE_CLAIM_IN_PERIOD');
      duplicateFound = true;
      fraudScore += 25;
    }
  }

  // ---- 3. Weather correlation ----
  let weatherCorrelates = true;
  const sourceData =
    typeof event.source_data === 'string'
      ? JSON.parse(event.source_data)
      : event.source_data;

  const eventType = event.event_type as DisruptionType;
  const threshold = TRIGGER_THRESHOLDS[eventType];

  if (threshold && eventType !== 'SOCIAL_DISRUPTION' && eventType !== 'FLOODING') {
    let actualValue: number | undefined;
    if (eventType === 'EXTREME_HEAT') actualValue = sourceData.temp;
    if (eventType === 'HEAVY_RAINFALL') actualValue = sourceData.rainfall_1h;
    if (eventType === 'SEVERE_POLLUTION') actualValue = sourceData.aqi;

    if (actualValue !== undefined && actualValue < threshold.value) {
      flags.push('WEATHER_BELOW_THRESHOLD');
      weatherCorrelates = false;
      fraudScore += 10;
    }
  }

  // ---- 4. Real BAS analysis ----
  const bas = await analyzeWorkerBehavior(claim.worker_id);

  // Incorporate BAS total into fraud score: lower BAS = higher fraud risk
  // BAS is 0-100 where 100 is trusted. Convert to fraud penalty: (100 - bas.total) * 0.4
  const basPenalty = Math.round((100 - bas.total) * 0.4);
  fraudScore += basPenalty;

  // Merge BAS flags into our flags
  for (const f of bas.flags) {
    if (!flags.includes(f)) flags.push(f);
  }

  // Cap fraud score at 100
  fraudScore = Math.min(100, fraudScore);

  // ---- Determine tier and status ----
  let tier: 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';
  let status: string;

  if (fraudScore <= 30) {
    tier = 'GREEN';
  } else if (fraudScore <= 50) {
    tier = 'YELLOW';
  } else if (fraudScore <= 70) {
    tier = 'ORANGE';
  } else {
    tier = 'RED';
  }

  // Admin-triggered claims are auto-approved (trusted source)
  if (source === 'ADMIN_TRIGGER') {
    status = 'APPROVED';
  // Manual worker claims ALWAYS go to admin review
  } else if (source === 'MANUAL') {
    status = 'UNDER_REVIEW';
  } else if (fraudScore <= 50) {
    status = 'APPROVED';
  } else {
    status = 'UNDER_REVIEW';
  }

  const details: FraudCheckDetails = {
    bas_score: bas.total,
    gps_authenticity: bas.gps_authenticity,
    movement_entropy: bas.movement_entropy,
    device_consistency: bas.device_consistency,
    historical_behavior: bas.historical_behavior,
    ring_fraud_absence: bas.ring_fraud_absence,
    weather_correlation: bas.weather_correlation,
    flags,
    tier,
    bas_breakdown: bas,
  };

  // Update claim
  await db('claims').where({ id: claimId }).update({
    fraud_score: fraudScore,
    fraud_check_details: JSON.stringify(details),
    status,
    updated_at: new Date(),
  });

  // Audit log
  await db('audit_log').insert({
    entity_type: 'claim',
    entity_id: claimId,
    new_state: JSON.stringify({ fraud_score: fraudScore, tier }),
    triggering_event: 'FRAUD_CHECK_COMPLETED',
    metadata: JSON.stringify({ fraudScore, tier, flags }),
    created_at: new Date(),
  });

  return { claimId, fraud_score: fraudScore, status, tier, details };
}
