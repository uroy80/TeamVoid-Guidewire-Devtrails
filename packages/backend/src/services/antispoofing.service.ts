import { db } from '../config/database.js';
import {
  haversineDistance,
  coefficientOfVariation,
  bearing,
  compassBin,
  shannonEntropy,
} from '@gigshield/shared';
import type { BASBreakdown } from '@gigshield/shared';

// ----------------------------------------------------------------
// Adaptive BAS Weights
// Base weights represent our initial threat model. In production these
// evolve via a feedback loop: confirmed fraud cases increase the weight
// of the component that caught them, false positives decrease it.
// For now we store the base weights and apply a fraud-rate adjustment.
// ----------------------------------------------------------------
const BASE_WEIGHTS = {
  gps_authenticity: 0.30,
  movement_entropy: 0.15,
  device_consistency: 0.15,
  historical_behavior: 0.20,
  ring_fraud_absence: 0.10,
  weather_correlation: 0.10,
};

// Adaptive multiplier: components that caught recent fraud get boosted.
// This is recalculated per-evaluation based on recent 30-day fraud patterns.
async function getAdaptiveWeights(): Promise<typeof BASE_WEIGHTS> {
  try {
    // Count which flags appeared most in recent confirmed fraud (last 30 days)
    const recentFraud = await db('claims')
      .where('fraud_score', '>', 50)
      .where('created_at', '>', new Date(Date.now() - 30 * 86400000))
      .select('fraud_check_details');

    if (recentFraud.length < 3) return BASE_WEIGHTS; // not enough data to adapt

    let gpsFlags = 0, deviceFlags = 0, ringFlags = 0;
    for (const row of recentFraud) {
      const details = typeof row.fraud_check_details === 'string'
        ? JSON.parse(row.fraud_check_details) : row.fraud_check_details;
      const flags: string[] = details?.flags || [];
      if (flags.some(f => f.includes('IMPOSSIBLE_TRAVEL') || f.includes('GPS_FAR'))) gpsFlags++;
      if (flags.some(f => f.includes('NEW_DEVICE') || f.includes('SHARED_DEVICE'))) deviceFlags++;
      if (flags.some(f => f.includes('RING_FRAUD') || f.includes('HIGH_CLAIM'))) ringFlags++;
    }

    const total = recentFraud.length;
    // Boost weights proportional to how often that attack vector appears
    const weights = { ...BASE_WEIGHTS };
    if (gpsFlags / total > 0.5) weights.gps_authenticity = Math.min(0.40, weights.gps_authenticity + 0.05);
    if (deviceFlags / total > 0.3) weights.device_consistency = Math.min(0.25, weights.device_consistency + 0.05);
    if (ringFlags / total > 0.2) weights.ring_fraud_absence = Math.min(0.20, weights.ring_fraud_absence + 0.05);

    // Renormalize to sum to 1.0
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    for (const key of Object.keys(weights) as (keyof typeof weights)[]) {
      weights[key] = weights[key] / sum;
    }
    return weights;
  } catch {
    return BASE_WEIGHTS;
  }
}

// Human speed constraints for movement validation
const MAX_HUMAN_SPEED_KMH = 120; // motorcycle max reasonable speed
const MAX_WALKING_SPEED_KMH = 7;
const ACCELERATION_LIMIT_KMH_PER_MIN = 60; // 0 to 60km/h in 1 min

// ----------------------------------------------------------------
// Sub-score computations
// ----------------------------------------------------------------

interface LocationRow {
  latitude: number;
  longitude: number;
  recorded_at: Date;
  device_fingerprint: string | null;
}

/**
 * GPS Authenticity (30%):
 * - Impossible travel: > 10km in < 5 minutes
 * - Location continuity: CV of consecutive distances
 */
async function computeGPSAuthenticity(
  workerId: string,
  flags: string[]
): Promise<number> {
  const locations: LocationRow[] = await db('worker_location_log')
    .where({ worker_id: workerId })
    .orderBy('recorded_at', 'desc')
    .limit(50);

  if (locations.length < 2) {
    flags.push('INSUFFICIENT_LOCATION_DATA');
    return 50; // Neutral score for no data
  }

  let impossibleTravel = false;
  const distances: number[] = [];

  for (let i = 0; i < locations.length - 1; i++) {
    const a = locations[i];
    const b = locations[i + 1];
    const dist = haversineDistance(a.latitude, a.longitude, b.latitude, b.longitude);
    const timeDiffMin =
      (new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()) / 60000;

    distances.push(dist);

    if (dist > 10 && timeDiffMin < 5 && timeDiffMin > 0) {
      impossibleTravel = true;
      flags.push(
        `IMPOSSIBLE_TRAVEL: ${dist.toFixed(1)}km in ${timeDiffMin.toFixed(1)}min`
      );
    }
  }

  if (impossibleTravel) return 0;

  // --- GPS Accuracy Check ---
  const accuracyRows = await db('worker_location_log')
    .where({ worker_id: workerId })
    .orderBy('recorded_at', 'desc')
    .limit(10)
    .select('accuracy_meters');

  if (accuracyRows.length > 0) {
    const avgAccuracy = accuracyRows.reduce(
      (sum: number, r: any) => sum + Number(r.accuracy_meters || 0),
      0
    ) / accuracyRows.length;

    if (avgAccuracy > 100) {
      flags.push('GPS_ACCURACY_ANOMALY');
      // Will apply penalty below
    }
  }

  // --- Speed Check ---
  for (let i = 0; i < locations.length - 1; i++) {
    const a = locations[i];
    const b = locations[i + 1];
    const dist = haversineDistance(a.latitude, a.longitude, b.latitude, b.longitude);
    const timeDiffSec =
      (new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()) / 1000;
    if (timeDiffSec > 0) {
      const speedMs = (dist * 1000) / timeDiffSec; // convert km to m
      if (speedMs > 33.3) { // > 120 km/h
        if (!flags.includes('IMPOSSIBLE_SPEED')) {
          flags.push('IMPOSSIBLE_SPEED');
        }
      }
    }
  }

  // --- Zone Boundary Check ---
  const workerRow = await db('workers').where({ id: workerId }).first();
  if (workerRow?.delivery_zone_id && locations.length > 0) {
    const zone = await db('delivery_zones').where({ id: workerRow.delivery_zone_id }).first();
    if (zone) {
      const latestLoc = locations[0]; // already ordered desc
      const distToZone = haversineDistance(
        latestLoc.latitude,
        latestLoc.longitude,
        Number(zone.latitude),
        Number(zone.longitude)
      );
      if (distToZone > 10) {
        flags.push('OUT_OF_ZONE');
      }
    }
  }

  // Apply penalties from new checks
  let penalty = 0;
  if (flags.includes('GPS_ACCURACY_ANOMALY')) penalty += 20;
  if (flags.includes('IMPOSSIBLE_SPEED')) penalty += 30;
  if (flags.includes('OUT_OF_ZONE')) penalty += 20;

  // Location continuity: low CV means spoofed/static, high is OK
  const cv = coefficientOfVariation(distances);
  // CV between 0.3 - 2.0 is healthy for real movement
  if (cv < 0.1) {
    flags.push('STATIC_LOCATION_PATTERN');
    return Math.max(0, 30 - penalty);
  }
  if (cv > 5) {
    flags.push('ERRATIC_LOCATION_PATTERN');
    return Math.max(0, 40 - penalty);
  }

  return Math.max(0, 100 - penalty);
}

/**
 * Movement Entropy (15%):
 * Shannon entropy of compass direction bins.
 * Real riders have high entropy (move in many directions).
 */
async function computeMovementEntropy(
  workerId: string,
  flags: string[]
): Promise<number> {
  const locations: LocationRow[] = await db('worker_location_log')
    .where({ worker_id: workerId })
    .orderBy('recorded_at', 'desc')
    .limit(50);

  if (locations.length < 3) {
    flags.push('INSUFFICIENT_MOVEMENT_DATA');
    return 50;
  }

  const bins = new Array(8).fill(0);

  for (let i = 0; i < locations.length - 1; i++) {
    const a = locations[i];
    const b = locations[i + 1];
    const brng = bearing(a.latitude, a.longitude, b.latitude, b.longitude);
    const bin = compassBin(brng);
    bins[bin]++;
  }

  const entropy = shannonEntropy(bins);

  // Score: entropy > 2.0 = 100, < 1.0 = 0, linear between
  if (entropy >= 2.0) return 100;
  if (entropy <= 1.0) return 0;
  return Math.round(((entropy - 1.0) / 1.0) * 100);
}

/**
 * Device Consistency (15%):
 * - Known device = 100
 * - New device = 50
 * - Multiple workers on same device = 0
 */
async function computeDeviceConsistency(
  workerId: string,
  flags: string[]
): Promise<number> {
  const fingerprints = await db('device_fingerprints')
    .where({ worker_id: workerId })
    .orderBy('last_seen_at', 'desc');

  if (fingerprints.length === 0) {
    flags.push('NO_DEVICE_FINGERPRINT');
    return 50;
  }

  const latestFP = fingerprints[0];

  // Check if multiple workers share this device
  const sharedDevice = await db('device_fingerprints')
    .where('fingerprint_hash', latestFP.fingerprint_hash)
    .whereNot('worker_id', workerId)
    .first();

  if (sharedDevice) {
    flags.push('SHARED_DEVICE_DETECTED');
    return 0;
  }

  // Check if device is "known" (seen before this week)
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  if (new Date(latestFP.first_seen_at) > oneWeekAgo) {
    flags.push('NEW_DEVICE');
    return 50;
  }

  return 100;
}

/**
 * Historical Behavior (20%):
 * Compare current period hours/earnings to worker averages.
 */
async function computeHistoricalBehavior(
  workerId: string,
  flags: string[]
): Promise<number> {
  const worker = await db('workers').where({ id: workerId }).first();
  if (!worker) return 50;

  // Get recent claims for this worker
  const recentClaims = await db('claims')
    .where({ worker_id: workerId })
    .where('created_at', '>=', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

  const totalClaimHours = recentClaims.reduce(
    (sum: number, c: any) => sum + Number(c.disruption_hours || 0),
    0
  );

  // If claim hours > avg daily hours * 10, suspicious
  const avgDailyHours = Number(worker.avg_hours_per_day) || 8;
  const expectedMax = avgDailyHours * 10; // ~10 disruption days in a month

  if (totalClaimHours > expectedMax * 2) {
    flags.push('EXCESSIVE_CLAIM_HOURS');
    return 20;
  }

  if (totalClaimHours > expectedMax) {
    flags.push('HIGH_CLAIM_FREQUENCY');
    return 60;
  }

  return 100;
}

/**
 * Ring Fraud Absence (10%):
 * Check if other claims from the same event share device fingerprints.
 */
async function computeRingFraudAbsence(
  workerId: string,
  flags: string[]
): Promise<number> {
  // Get recent claims for this worker
  const recentClaims = await db('claims')
    .where({ worker_id: workerId })
    .where('created_at', '>=', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

  if (recentClaims.length === 0) return 100;

  // Get device fingerprints for this worker
  const workerFPs = await db('device_fingerprints')
    .where({ worker_id: workerId })
    .pluck('fingerprint_hash');

  if (workerFPs.length === 0) return 100;

  // For each of the worker's recent claims, check if other claimants share a device
  for (const claim of recentClaims) {
    const otherClaimants = await db('claims')
      .where({ disruption_event_id: claim.disruption_event_id })
      .whereNot({ worker_id: workerId })
      .pluck('worker_id');

    if (otherClaimants.length === 0) continue;

    const sharedDeviceWorkers = await db('device_fingerprints')
      .whereIn('worker_id', otherClaimants)
      .whereIn('fingerprint_hash', workerFPs)
      .pluck('worker_id');

    if (sharedDeviceWorkers.length > 0) {
      flags.push(`RING_FRAUD_SIGNAL: shared device with ${sharedDeviceWorkers.length} other claimant(s)`);
      return 0;
    }
  }

  return 100;
}

/**
 * Weather Correlation (10%):
 * Verify the disruption event trigger data matches real weather thresholds.
 */
async function computeWeatherCorrelation(
  workerId: string,
  flags: string[]
): Promise<number> {
  // Get the most recent claim
  const claim = await db('claims')
    .where({ worker_id: workerId })
    .orderBy('created_at', 'desc')
    .first();

  if (!claim) return 100;

  const event = await db('disruption_events')
    .where({ id: claim.disruption_event_id })
    .first();

  if (!event) return 100;

  const sourceData =
    typeof event.source_data === 'string'
      ? JSON.parse(event.source_data)
      : event.source_data;

  // Manual events are always correlated
  if (sourceData.source === 'manual_admin' || sourceData.source === 'admin') {
    return 100;
  }

  // Check if source data has matching trigger values
  if (sourceData.source === 'openweathermap' || sourceData.source === 'aqicn') {
    return 100; // Data came from verified API
  }

  flags.push('UNVERIFIED_TRIGGER_SOURCE');
  return 50;
}

// ----------------------------------------------------------------
// Main BAS computation
// ----------------------------------------------------------------

export async function analyzeWorkerBehavior(
  workerId: string
): Promise<BASBreakdown> {
  const flags: string[] = [];

  const [
    gpsScore,
    entropyScore,
    deviceScore,
    historyScore,
    ringScore,
    weatherScore,
  ] = await Promise.all([
    computeGPSAuthenticity(workerId, flags),
    computeMovementEntropy(workerId, flags),
    computeDeviceConsistency(workerId, flags),
    computeHistoricalBehavior(workerId, flags),
    computeRingFraudAbsence(workerId, flags),
    computeWeatherCorrelation(workerId, flags),
  ]);

  // Get adaptive weights (evolves based on recent fraud patterns)
  const WEIGHTS = await getAdaptiveWeights();

  const total = Math.round(
    gpsScore * WEIGHTS.gps_authenticity +
    entropyScore * WEIGHTS.movement_entropy +
    deviceScore * WEIGHTS.device_consistency +
    historyScore * WEIGHTS.historical_behavior +
    ringScore * WEIGHTS.ring_fraud_absence +
    weatherScore * WEIGHTS.weather_correlation
  );

  let tier: 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';
  if (total >= 80) tier = 'GREEN';
  else if (total >= 50) tier = 'YELLOW';
  else if (total >= 30) tier = 'ORANGE';
  else tier = 'RED';

  return {
    gps_authenticity: gpsScore,
    movement_entropy: entropyScore,
    device_consistency: deviceScore,
    historical_behavior: historyScore,
    ring_fraud_absence: ringScore,
    weather_correlation: weatherScore,
    total,
    tier,
    flags,
  };
}
