import { db } from '../config/database.js';
import { computePayout, COVERAGE_TIERS } from '@gigshield/shared';
import type { Claim, CoverageLevel } from '@gigshield/shared';
import { randomUUID } from 'crypto';
import { events } from './events.service.js';

function generateClaimNumber(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `CLM-${code}`;
}

/**
 * Process a disruption event: find all affected workers with active policies
 * and create claims for each.
 */
export async function processDisruptionEvent(eventId: string): Promise<Claim[]> {
  const event = await db('disruption_events').where({ id: eventId }).first();
  if (!event) throw new Error(`Disruption event ${eventId} not found`);

  // Find all workers with ACTIVE policies in the affected zone
  const activeWorkers = await db('policies')
    .join('workers', 'policies.worker_id', 'workers.id')
    .where('workers.delivery_zone_id', event.delivery_zone_id)
    .where('policies.status', 'ACTIVE')
    .where('policies.coverage_period_start', '<=', new Date())
    .where('policies.coverage_period_end', '>=', new Date())
    .select(
      'policies.id as policy_id',
      'policies.worker_id',
      'policies.coverage_level',
      'workers.hourly_rate',
      'workers.avg_hours_per_day'
    );

  const claims: Claim[] = [];

  for (const row of activeWorkers) {
    const coverageLevel = row.coverage_level as CoverageLevel;
    const tier = COVERAGE_TIERS[coverageLevel];
    const disruptionHours = Math.min(
      event.duration_estimate_hours,
      Number(row.avg_hours_per_day)
    );
    const payout = computePayout(
      disruptionHours,
      Number(row.hourly_rate),
      tier.coveragePct
    );

    const id = randomUUID();
    const now = new Date();

    await db('claims').insert({
      id,
      claim_number: generateClaimNumber(),
      policy_id: row.policy_id,
      worker_id: row.worker_id,
      disruption_event_id: eventId,
      status: 'CREATED',
      disruption_hours: disruptionHours,
      estimated_hourly_earnings: Number(row.hourly_rate),
      coverage_level_pct: tier.coveragePct,
      income_loss_payout: payout,
      fraud_score: 0,
      fraud_check_details: null,
      rejection_reason: null,
      created_at: now,
      updated_at: now,
    });

    const claim = await db('claims').where({ id }).first();
    claims.push(claim as Claim);

    try {
      events.emitEvent('CLAIM_CREATED', {
        claim_id: claim.id,
        claim_number: claim.claim_number,
        worker_id: claim.worker_id,
        payout: claim.income_loss_payout,
        source: 'AUTO',
      });
    } catch {}
  }

  return claims;
}

export async function requestClaim(
  workerId: string,
  disruptionType: string,
  description: string,
  location: { latitude: number; longitude: number },
  deviceFingerprint?: string,
  ipAddress?: string
): Promise<any> {
  // 1. Check worker has active policy
  const activePolicy = await db('policies')
    .where({ worker_id: workerId, status: 'ACTIVE' })
    .first();
  if (!activePolicy) throw new Error('No active policy found');

  // 2. Get worker details
  const workerData = await db('workers').where({ id: workerId }).first();
  if (!workerData) throw new Error('Worker not found');

  // 3. Get coverage tier config — read from shared COVERAGE_TIERS so basic/standard/premium
  //    stay in lock-step with the rest of the app (frontend plan cards, payout calcs, pricing).
  //    Current tiers: basic=40%, standard=60%, premium=80%.
  const coveragePct =
    COVERAGE_TIERS[activePolicy.coverage_level as CoverageLevel]?.coveragePct ?? 0.60;

  // 4. Resolve duration from a recent matching disruption event (if any)
  //    so the payout reflects the real impact, not a hard-coded 4 hours.
  const recentEventForDuration = await db('disruption_events')
    .where({ delivery_zone_id: workerData.delivery_zone_id, event_type: disruptionType.toUpperCase() })
    .where('event_timestamp', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
    .first();

  const eventDurationHours = Number(recentEventForDuration?.duration_estimate_hours) || 4;
  const avgHoursPerDay = Number(workerData.avg_hours_per_day) || 6;

  // Cap base duration at one shift: min(event duration, avg hours/day, 8)
  const baseDurationHours = Math.min(eventDurationHours, avgHoursPerDay, 8);

  // Severity multiplier
  const severity = String(recentEventForDuration?.severity || 'MODERATE').toUpperCase();
  const severityMultiplier = severity === 'MILD' ? 0.5 : severity === 'SEVERE' ? 1.25 : 1.0;

  // Effective hours, still capped at 8 after severity scaling
  const effectiveHours = Math.min(8, baseDurationHours * severityMultiplier);
  const disruptionHours = effectiveHours;

  const hourlyRate = Number(workerData.hourly_rate) || 120;
  // Apply coverage tier (basic=40%, standard=60%, premium=80%) then clamp
  // between Rs. 100 floor and Rs. 2000 ceiling to prevent abuse and preserve UX.
  const rawPayout = Math.round(hourlyRate * effectiveHours * coveragePct);
  const payout = Math.max(100, Math.min(2000, rawPayout));

  // 5. Generate claim number
  const claimNumber = `CLM-${Math.floor(100000 + Math.random() * 900000)}`;

  // 6. Find or create a disruption event for manual claims
  // Look for existing event of same type in worker's zone within last 24 hours
  const recentEvent = await db('disruption_events')
    .where({ delivery_zone_id: workerData.delivery_zone_id, event_type: disruptionType.toUpperCase() })
    .where('event_timestamp', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
    .first();

  let eventId = recentEvent?.id;
  if (!eventId) {
    // Create a manual disruption event
    const [evt] = await db('disruption_events').insert({
      event_type: disruptionType.toUpperCase(),
      severity: 'MODERATE',
      delivery_zone_id: workerData.delivery_zone_id,
      duration_estimate_hours: disruptionHours,
      source_data: JSON.stringify({ source: 'MANUAL_WORKER_REPORT', description, reporter: workerId }),
      verified_by_sources: '{WORKER_REPORT}',
      event_timestamp: new Date(),
    }).returning('*');
    eventId = evt.id;
  }

  // 7. Create claim
  const [claim] = await db('claims').insert({
    claim_number: claimNumber,
    policy_id: activePolicy.id,
    worker_id: workerId,
    disruption_event_id: eventId,
    status: 'CREATED',
    disruption_hours: disruptionHours,
    estimated_hourly_earnings: hourlyRate,
    coverage_level_pct: coveragePct,
    income_loss_payout: payout,
    source: 'MANUAL',
    description,
    request_device_fingerprint: deviceFingerprint || null,
    request_latitude: location.latitude,
    request_longitude: location.longitude,
    request_ip: ipAddress || null,
  }).returning('*');

  // 8. Log the location ping from claim request with IP
  await db('worker_location_log').insert({
    worker_id: workerId,
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy_meters: 0,
    source: 'GPS',
    device_fingerprint: deviceFingerprint || null,
    ip_address: ipAddress || null,
    recorded_at: new Date(),
  });

  try {
    events.emitEvent('CLAIM_CREATED', {
      claim_id: claim.id,
      claim_number: claim.claim_number,
      worker_id: claim.worker_id,
      payout: claim.income_loss_payout,
      source: 'MANUAL',
    });
  } catch {}

  return claim;
}

export async function getByWorker(workerId: string): Promise<Claim[]> {
  const claims = await db('claims')
    .where({ worker_id: workerId })
    .orderBy('created_at', 'desc');
  return claims as Claim[];
}

export async function getById(claimId: string): Promise<Claim & { event?: any; policy?: any }> {
  const claim = await db('claims').where({ id: claimId }).first();
  if (!claim) throw new Error(`Claim ${claimId} not found`);

  const event = await db('disruption_events')
    .where({ id: claim.disruption_event_id })
    .first();

  const policy = await db('policies')
    .where({ id: claim.policy_id })
    .first();

  return { ...claim, event, policy } as Claim & { event?: any; policy?: any };
}

export async function getReviewQueue(): Promise<(Claim & { worker_name?: string; worker_mobile?: string; worker_platform?: string; event_type?: string; event_severity?: string; zone_name?: string })[]> {
  const claims = await db('claims')
    .leftJoin('workers', 'claims.worker_id', 'workers.id')
    .leftJoin('disruption_events', 'claims.disruption_event_id', 'disruption_events.id')
    .leftJoin('delivery_zones', 'disruption_events.delivery_zone_id', 'delivery_zones.id')
    .where('claims.status', 'UNDER_REVIEW')
    .orderBy('claims.fraud_score', 'desc')
    .select(
      'claims.*',
      'workers.name as worker_name',
      'workers.mobile as worker_mobile',
      'workers.platform as worker_platform',
      'disruption_events.event_type as event_type',
      'disruption_events.severity as event_severity',
      'delivery_zones.name as zone_name'
    );
  return claims;
}

export async function resolveReview(
  claimId: string,
  approved: boolean,
  reason?: string
): Promise<Claim> {
  const claim = await db('claims').where({ id: claimId }).first();
  if (!claim) throw new Error(`Claim ${claimId} not found`);

  const status = approved ? 'APPROVED' : 'REJECTED';
  const update: Record<string, unknown> = {
    status,
    updated_at: new Date(),
  };

  if (!approved && reason) {
    update.rejection_reason = reason;
  }

  await db('claims').where({ id: claimId }).update(update);

  // Audit log
  await db('audit_log').insert({
    entity_type: 'claim',
    entity_id: claimId,
    new_state: JSON.stringify({ status: approved ? 'APPROVED' : 'REJECTED' }),
    triggering_event: approved ? 'CLAIM_APPROVED' : 'CLAIM_REJECTED',
    metadata: JSON.stringify({ approved, reason, actor: 'admin' }),
    created_at: new Date(),
  });

  const updated = await db('claims').where({ id: claimId }).first();
  return updated as Claim;
}
