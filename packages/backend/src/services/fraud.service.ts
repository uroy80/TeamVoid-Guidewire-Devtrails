import { db } from '../config/database.js';
import { haversineDistance, TRIGGER_THRESHOLDS } from '@gigshield/shared';
import type { Claim, FraudCheckDetails, DisruptionType } from '@gigshield/shared';
import { randomUUID } from 'crypto';
import { analyzeWorkerBehavior } from './antispoofing.service.js';
import {
  analyzeWorkerLinkage,
  detectSynchronousClaims,
  detectZoneBurst,
  SYNCHRONOUS_CLAIM_PENALTY,
  ZONE_BURST_PENALTY,
} from './linkage.service.js';
import { events } from './events.service.js';
import { env } from '../config/env.js';

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

  // ---- 4a. Ring-fraud linkage (shared UPI / device / IP) ----------------
  // These three signals run in parallel — each is a single indexed query.
  // Penalty is capped at MAX_LINKAGE_PENALTY inside analyzeWorkerLinkage
  // so a single strong signal can't alone fabricate a RED claim, but the
  // composite of all three can tip a borderline claim over.
  const linkage = await analyzeWorkerLinkage(claim.worker_id);
  fraudScore += linkage.penalty;
  for (const f of linkage.flags) {
    if (!flags.includes(f)) flags.push(f);
  }

  // ---- 4b. Synchronous-claim cluster detector --------------------------
  // Multiple workers filing claims on the same event within 2 minutes is
  // only suspicious when the cluster has existing device/IP/UPI links.
  // A real rainstorm produces a natural burst of *unlinked* claims.
  const syncResult = await detectSynchronousClaims(claim.disruption_event_id, 120);
  if (syncResult.suspicious) {
    fraudScore += SYNCHRONOUS_CLAIM_PENALTY;
    flags.push(
      `SYNCHRONOUS_CLAIM_CLUSTER: ${syncResult.claim_count} claims / ${syncResult.worker_count} linked workers in ${syncResult.window_seconds}s`,
    );
  }

  // ---- 4c. Zone velocity burst detector --------------------------------
  // Claim rate ≥ 5× this zone's 30-day baseline AND ≥ 5 claims in window.
  // Also only runs when we have a zone — no-op on zone-less events.
  const zoneBurst = zone?.id ? await detectZoneBurst(zone.id, 60) : null;
  if (zoneBurst?.burst) {
    fraudScore += ZONE_BURST_PENALTY;
    flags.push(
      `ZONE_VELOCITY_BURST: ${zoneBurst.current_count} claims vs ${zoneBurst.baseline_per_hour}/hr baseline (${zoneBurst.ratio}x)`,
    );
  }

  // Cap fraud score at 100
  fraudScore = Math.min(100, fraudScore);

  // Preserve the rule-based score so it's stored even if ML overrides it.
  const ruleBasedScore = fraudScore;

  // ---- 5. Optional ML sidecar ----
  const mlClaimSource: 'AUTO' | 'MANUAL' =
    source === 'MANUAL' ? 'MANUAL' : 'AUTO';
  const mlResult = await callMlSidecar({
    worker_id: claim.worker_id,
    claim_id: claimId,
    bas_components: {
      tem: bas.historical_behavior,
      geo: bas.gps_authenticity,
      dev: bas.device_consistency,
      net: bas.weather_correlation, // no dedicated network score yet — reuse weather signal
      beh: bas.movement_entropy,
      soc: bas.ring_fraud_absence,
    },
    velocity: await computeMlVelocity(claim.worker_id),
    temporal: await computeMlTemporal(claim.worker_id, event.event_timestamp),
    context: {
      zone_hazard_score: Number(zone?.risk_score ?? 50),
      worker_trust_score: Number(worker.trust_score ?? bas.total ?? 50),
      payout_amount: Number(claim.income_loss_payout ?? 0),
      claim_source: mlClaimSource,
    },
  });

  const mlUsed = mlResult !== null;
  if (mlUsed && mlResult) {
    // ML fraud score (0..100) overrides the rule score for decisioning.
    fraudScore = Math.round(mlResult.fraud_probability * 100);
  }

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
  } else if (mlUsed && mlResult) {
    // When ML is authoritative, use its decision directly.
    if (mlResult.decision === 'APPROVE') status = 'APPROVED';
    else if (mlResult.decision === 'DECLINE') status = 'REJECTED';
    else status = 'UNDER_REVIEW';
  } else if (fraudScore <= 50) {
    status = 'APPROVED';
  } else {
    status = 'UNDER_REVIEW';
  }

  const details: FraudCheckDetails & {
    rule_based_score?: number;
    ml_used?: boolean;
    ml_explanations?: unknown;
    ml_model_version?: string;
    linkage?: {
      distinct_linked_workers: number;
      penalty: number;
      shared_device_count: number;
      shared_ip_count: number;
      shared_upi_count: number;
      flags: string[];
    };
    synchronous_cluster?: {
      claim_count: number;
      worker_count: number;
      suspicious: boolean;
      window_seconds: number;
    };
    zone_burst?: {
      zone_id: string;
      current_count: number;
      baseline_per_hour: number;
      ratio: number;
      burst: boolean;
    };
  } = {
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
    rule_based_score: ruleBasedScore,
    ml_used: mlUsed,
    linkage: {
      distinct_linked_workers: linkage.distinct_linked_workers,
      penalty: linkage.penalty,
      shared_device_count: linkage.shared_devices.length,
      shared_ip_count: linkage.shared_ips.length,
      shared_upi_count: linkage.shared_upis.length,
      flags: linkage.flags,
    },
    synchronous_cluster: {
      claim_count: syncResult.claim_count,
      worker_count: syncResult.worker_count,
      suspicious: syncResult.suspicious,
      window_seconds: syncResult.window_seconds,
    },
    ...(zoneBurst
      ? {
          zone_burst: {
            zone_id: zoneBurst.zone_id,
            current_count: zoneBurst.current_count,
            baseline_per_hour: zoneBurst.baseline_per_hour,
            ratio: zoneBurst.ratio,
            burst: zoneBurst.burst,
          },
        }
      : {}),
    ...(mlUsed && mlResult
      ? {
          ml_explanations: mlResult.top_factors,
          ml_model_version: mlResult.model_version,
        }
      : {}),
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

  try {
    events.emitEvent('FRAUD_CHECKED', {
      claim_id: claimId,
      claim_number: claim.claim_number,
      fraud_score: fraudScore,
      tier,
      status,
      source: source || 'AUTO',
      ml_used: mlUsed,
    });
  } catch {}

  return { claimId, fraud_score: fraudScore, status, tier, details };
}

// ---------------------------------------------------------------------------
// ML sidecar integration (private helpers)
// ---------------------------------------------------------------------------

interface MlShapFactor {
  feature: string;
  value: number;
  shap_value: number;
  direction: 'increases_fraud' | 'decreases_fraud';
}

interface MlFraudResponse {
  fraud_probability: number;
  decision: 'APPROVE' | 'REVIEW' | 'DECLINE';
  tier: 'LOW' | 'MEDIUM' | 'HIGH';
  top_factors: MlShapFactor[];
  model_version: string;
  latency_ms: number;
}

interface MlRequest {
  worker_id: string;
  claim_id: string;
  bas_components: {
    tem: number;
    geo: number;
    dev: number;
    net: number;
    beh: number;
    soc: number;
  };
  velocity: {
    claims_last_24h: number;
    claims_last_7d: number;
    shared_device_workers: number;
    shared_ip_workers: number;
  };
  temporal: {
    hours_since_registration: number;
    minutes_since_disruption: number;
    claim_hour_of_day: number;
  };
  context: {
    zone_hazard_score: number;
    worker_trust_score: number;
    payout_amount: number;
    claim_source: 'AUTO' | 'MANUAL';
  };
}

/** Call the ML sidecar. Returns null on timeout / error / disabled. */
async function callMlSidecar(payload: MlRequest): Promise<MlFraudResponse | null> {
  const base = (env.ML_FRAUD_URL || '').trim();
  if (!base) return null;

  const timeoutMs = Number(env.ML_FRAUD_TIMEOUT_MS) || 500;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/v1/fraud/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.warn(`[fraud.ml] sidecar returned HTTP ${res.status}, falling back to rules`);
      return null;
    }
    const json = (await res.json()) as MlFraudResponse;
    return json;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[fraud.ml] sidecar call failed (${msg}), falling back to rules`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function computeMlVelocity(workerId: string): Promise<MlRequest['velocity']> {
  const now = Date.now();
  const since24h = new Date(now - 24 * 60 * 60 * 1000);
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

  const [c24] = await db('claims')
    .where({ worker_id: workerId })
    .where('created_at', '>=', since24h)
    .count<{ count: string }[]>('id as count');

  const [c7d] = await db('claims')
    .where({ worker_id: workerId })
    .where('created_at', '>=', since7d)
    .count<{ count: string }[]>('id as count');

  // shared_device_workers: # distinct other workers seen on any of this worker's devices
  const fps = await db('device_fingerprints')
    .where({ worker_id: workerId })
    .pluck<string[]>('fingerprint_hash');

  let sharedDeviceWorkers = 0;
  if (fps.length > 0) {
    const others = await db('device_fingerprints')
      .whereIn('fingerprint_hash', fps)
      .whereNot('worker_id', workerId)
      .distinct<{ worker_id: string }[]>('worker_id');
    sharedDeviceWorkers = others.length;
  }

  // shared_ip_workers: not tracked yet — default to 0 if the table is missing.
  let sharedIpWorkers = 0;
  try {
    const hasIpTable = await db.schema.hasTable('worker_ip_log');
    if (hasIpTable) {
      const ipRows = await db('worker_ip_log')
        .where({ worker_id: workerId })
        .where('seen_at', '>=', since24h)
        .distinct<{ ip_address: string }[]>('ip_address');
      const ips = ipRows.map((r) => r.ip_address);
      if (ips.length > 0) {
        const others = await db('worker_ip_log')
          .whereIn('ip_address', ips)
          .where('seen_at', '>=', since24h)
          .whereNot('worker_id', workerId)
          .distinct<{ worker_id: string }[]>('worker_id');
        sharedIpWorkers = others.length;
      }
    }
  } catch {
    sharedIpWorkers = 0;
  }

  return {
    claims_last_24h: Number(c24?.count ?? 0),
    claims_last_7d: Number(c7d?.count ?? 0),
    shared_device_workers: sharedDeviceWorkers,
    shared_ip_workers: sharedIpWorkers,
  };
}

async function computeMlTemporal(
  workerId: string,
  eventTs: Date | string | null | undefined
): Promise<MlRequest['temporal']> {
  const worker = await db('workers').where({ id: workerId }).first();
  const now = new Date();
  const createdAt = worker?.created_at ? new Date(worker.created_at) : now;
  const hoursSinceReg = Math.max(0, (now.getTime() - createdAt.getTime()) / 3_600_000);

  const evDate = eventTs ? new Date(eventTs) : now;
  const minsSinceDisruption = Math.max(0, (now.getTime() - evDate.getTime()) / 60_000);

  return {
    hours_since_registration: Number(hoursSinceReg.toFixed(2)),
    minutes_since_disruption: Number(minsSinceDisruption.toFixed(2)),
    claim_hour_of_day: now.getHours(),
  };
}
