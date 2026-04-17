import { db } from '../config/database.js';
import { haversineDistance } from '@gigshield/shared';
import { events } from './events.service.js';

export type ConditionType = 'RAIN' | 'FLOOD' | 'HEAT' | 'POLLUTION' | 'STRIKE';
export type Severity = 'MILD' | 'MODERATE' | 'SEVERE';

// Map community conditions → disruption event types in the existing schema
const CONDITION_TO_EVENT_TYPE: Record<ConditionType, string> = {
  RAIN: 'HEAVY_RAINFALL',
  FLOOD: 'FLOODING',
  HEAT: 'EXTREME_HEAT',
  POLLUTION: 'SEVERE_POLLUTION',
  STRIKE: 'SOCIAL_DISRUPTION',
};

const CLUSTER_RADIUS_KM = 2;
const CLUSTER_WINDOW_MIN = 15;
const CLUSTER_MIN_REPORTS = 3;
const TRUST_BOOST_ON_API_CONFIRM = 20;
const TRUST_BOOST_ON_CLUSTER = 5;

// ─── Anti-collusion thresholds ────────────────────────────────────────────────
// A ring of fraudsters could otherwise trigger a "cluster" by submitting
// three reports from the same phone, same home network, or three fresh
// sock-puppet accounts. These guardrails make a real community signal hard
// to fake without real people in real places.
const MIN_TRUST_SCORE_TO_COUNT     = 25;      // worker's trust must be ≥ this
const MIN_ACCOUNT_AGE_HOURS        = 1;       // worker must have existed ≥ this
const CLUSTER_MIN_DISTINCT_IPS     = 3;       // must come from ≥ N unique IPs
const CLUSTER_MIN_DISTINCT_DEVICES = 3;       // AND ≥ N unique devices (can't fake with one phone)

export interface SubmitReportInput {
  workerId: string;
  latitude: number;
  longitude: number;
  conditionType: ConditionType;
  severity: Severity;
  notes?: string;
  ipAddress?: string;
  deviceFingerprint?: string;
}

/**
 * Submit a community report. If this is the 3rd+ report of the same condition
 * within 2km in the last 15 min, automatically create a provisional disruption
 * event and mark all reports as verified.
 */
export async function submitReport(input: SubmitReportInput): Promise<{
  report_id: string;
  clustered: boolean;
  disruption_event_id: string | null;
  cluster_size: number;
}> {
  const {
    workerId, latitude, longitude, conditionType, severity,
    notes, ipAddress, deviceFingerprint,
  } = input;

  // Fall back to the worker's most recent known device fingerprint when the
  // client didn't send one — this keeps old clients from quietly passing the
  // distinct-device check by sending nulls.
  let deviceFp: string | null = deviceFingerprint ?? null;
  if (!deviceFp) {
    const recentFp = await db('device_fingerprints')
      .where({ worker_id: workerId })
      .orderBy('last_seen_at', 'desc')
      .first();
    if (recentFp?.fingerprint_hash) deviceFp = recentFp.fingerprint_hash;
  }

  // Insert the report
  const [row] = await db('community_reports')
    .insert({
      worker_id: workerId,
      latitude,
      longitude,
      condition_type: conditionType,
      severity,
      notes: notes ?? null,
      ip_address: ipAddress ?? null,
      device_fingerprint: deviceFp,
    })
    .returning('*');

  // Emit the report event (for live ops feed)
  try {
    events.emitEvent('COMMUNITY_REPORT', {
      report_id: row.id,
      worker_id: workerId,
      condition_type: conditionType,
      severity,
      latitude,
      longitude,
    });
  } catch { /* */ }

  // Check for a cluster
  const cluster = await findCluster(latitude, longitude, conditionType);

  // Count DISTINCT workers, DISTINCT IP addresses, and DISTINCT device
  // fingerprints. A collusion ring can produce 3 reports from one phone
  // by juggling SIMs (→ 3 workers, 1 device) or from one account on 3
  // Wi-Fi networks (→ 1 worker, 3 IPs). Requiring distinctness on both
  // axes forces at least 3 real people standing in real places.
  const distinctWorkers = new Set(cluster.map((r) => r.worker_id)).size;
  const distinctIps = new Set(
    cluster.map((r) => r.ip_address).filter((ip): ip is string => !!ip),
  ).size;
  const distinctDevices = new Set(
    cluster.map((r) => r.device_fingerprint).filter((fp): fp is string => !!fp),
  ).size;

  const clusterQualifies =
    cluster.length >= CLUSTER_MIN_REPORTS &&
    distinctWorkers >= CLUSTER_MIN_REPORTS &&
    // When IPs are known for the cluster, require N distinct ones — when
    // they're all nullable (very old records or proxied traffic) fall
    // back to the distinct-worker check alone.
    (distinctIps === 0 || distinctIps >= CLUSTER_MIN_DISTINCT_IPS) &&
    // Same fallback strategy for devices. But in practice the fallback
    // should fire only during migration: new reports always carry a FP.
    (distinctDevices === 0 || distinctDevices >= CLUSTER_MIN_DISTINCT_DEVICES);

  if (clusterQualifies) {
    // Is there ALREADY a disruption event these reports are linked to?
    const linkedIds = cluster
      .map((r) => r.disruption_event_id)
      .filter((x): x is string => !!x);

    let disruptionEventId: string;

    if (linkedIds.length > 0) {
      // Already created — reuse
      disruptionEventId = linkedIds[0];
    } else {
      // Create a new provisional disruption event
      const worker = await db('workers').where({ id: workerId }).first();
      const zoneId = worker?.delivery_zone_id;
      if (!zoneId) {
        // Worker has no zone — can't create event, just return the report
        return {
          report_id: row.id,
          clustered: false,
          disruption_event_id: null,
          cluster_size: cluster.length,
        };
      }

      const [eventRow] = await db('disruption_events')
        .insert({
          event_type: CONDITION_TO_EVENT_TYPE[conditionType],
          severity: severity === 'SEVERE' ? 'SEVERE' : severity === 'MILD' ? 'MODERATE' : 'MODERATE',
          delivery_zone_id: zoneId,
          affected_dark_store_ids: '{}',
          duration_estimate_hours: 4,
          source_data: JSON.stringify({
            source: 'community',
            reporter_count: cluster.length,
            center: { lat: latitude, lng: longitude },
          }),
          verified_by_sources: '{community}',
          event_timestamp: new Date(),
          created_at: new Date(),
        })
        .returning('*');
      disruptionEventId = eventRow.id;

      // Fire a trigger event so it shows in live ops feed
      try {
        events.emitEvent('TRIGGER_FIRED', {
          event_id: disruptionEventId,
          event_type: CONDITION_TO_EVENT_TYPE[conditionType],
          severity,
          zone_id: zoneId,
          source: 'COMMUNITY',
        });
      } catch { /* */ }
    }

    // Mark all reports in the cluster as verified + linked + boost trust
    const reportIds = cluster.map((r) => r.id);
    await db('community_reports')
      .whereIn('id', reportIds)
      .update({ verified: true, disruption_event_id: disruptionEventId });

    const workerIds = Array.from(new Set(cluster.map((r) => r.worker_id)));
    await db('workers')
      .whereIn('id', workerIds)
      .update({
        trust_score: db.raw(`LEAST(trust_score + ${TRUST_BOOST_ON_CLUSTER}, 100)`),
      });

    return {
      report_id: row.id,
      clustered: true,
      disruption_event_id: disruptionEventId,
      cluster_size: cluster.length,
    };
  }

  return {
    report_id: row.id,
    clustered: false,
    disruption_event_id: null,
    cluster_size: cluster.length,
  };
}

/**
 * Find nearby community reports of the same condition within the last 15 min.
 * Includes the current one (just inserted).
 */
async function findCluster(
  lat: number,
  lng: number,
  conditionType: ConditionType,
): Promise<Array<{
  id: string;
  worker_id: string;
  disruption_event_id: string | null;
  latitude: number;
  longitude: number;
  ip_address: string | null;
  device_fingerprint: string | null;
}>> {
  const windowMs = CLUSTER_WINDOW_MIN * 60 * 1000;
  const cutoff = new Date(Date.now() - windowMs);
  const accountAgeCutoff = new Date(Date.now() - MIN_ACCOUNT_AGE_HOURS * 60 * 60 * 1000);

  // Rough bounding box ~2km = ~0.02deg
  const degBuffer = CLUSTER_RADIUS_KM / 111;

  // Pre-filter at the DB layer: only count reports whose reporter has been
  // around long enough AND carries a trust score above the floor. This
  // blocks sock-puppets (accounts created minutes ago) and workers whose
  // trust has been demoted due to past false reports.
  const rows = await db('community_reports as cr')
    .join('workers as w', 'cr.worker_id', 'w.id')
    .where('cr.condition_type', conditionType)
    .where('cr.created_at', '>=', cutoff)
    .whereBetween('cr.latitude', [lat - degBuffer, lat + degBuffer])
    .whereBetween('cr.longitude', [lng - degBuffer, lng + degBuffer])
    .where('w.trust_score', '>=', MIN_TRUST_SCORE_TO_COUNT)
    .where('w.created_at', '<=', accountAgeCutoff)
    .select(
      'cr.id',
      'cr.worker_id',
      'cr.disruption_event_id',
      'cr.latitude',
      'cr.longitude',
      'cr.ip_address',
      'cr.device_fingerprint',
    );

  // Precise haversine filter
  return rows
    .map((r: any) => ({
      ...r,
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
    }))
    .filter((r: any) =>
      haversineDistance(lat, lng, r.latitude, r.longitude) <= CLUSTER_RADIUS_KM,
    );
}

/**
 * When a weather API later confirms a disruption that community reporters
 * already flagged, we reward the reporters with a bigger trust boost.
 * Called from trigger.service.checkAllZones when an API event matches a
 * pending community one.
 */
export async function boostTrustOnApiConfirm(
  disruptionEventId: string,
): Promise<number> {
  const reports = await db('community_reports')
    .where({ disruption_event_id: disruptionEventId })
    .select('worker_id');

  const workerIds = Array.from(new Set(reports.map((r: any) => r.worker_id)));
  if (workerIds.length === 0) return 0;

  await db('workers')
    .whereIn('id', workerIds)
    .update({
      trust_score: db.raw(`LEAST(trust_score + ${TRUST_BOOST_ON_API_CONFIRM}, 100)`),
    });

  return workerIds.length;
}

export async function getPendingReports(limit = 50) {
  return db('community_reports')
    .leftJoin('workers', 'community_reports.worker_id', 'workers.id')
    .where({ verified: false })
    .orderBy('community_reports.created_at', 'desc')
    .limit(limit)
    .select(
      'community_reports.*',
      'workers.name as worker_name',
      'workers.trust_score as worker_trust_score',
    );
}
