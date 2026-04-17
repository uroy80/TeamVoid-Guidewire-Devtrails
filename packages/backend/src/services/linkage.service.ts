import { db } from '../config/database.js';

/**
 * linkage.service — the centre of the ring-fraud detector.
 *
 * "Ring fraud" in the Indian gig-work context is almost always one of:
 *   1. N sock-puppet worker accounts all funnelling payouts to one UPI
 *      handle (the orchestrator's).
 *   2. N accounts sharing one device (fingerprint) — same phone, new SIM.
 *   3. N accounts sharing one public IP (home WiFi / office VPN / data
 *      centre range for bot farms).
 *   4. A burst of claims in a short window on a single disruption event
 *      from a cluster of linked accounts.
 *
 * All four signals collapse into the same question: "which other workers
 * is this worker *linked* to?" The linkage graph is what admins look at
 * to spot the ring visually, and it's what the fraud engine uses to add
 * a penalty to the rule-based score.
 *
 * Performance: every function here runs on the hot path (fraud check on
 * every claim). We keep queries bounded by `worker_id =` or `WHERE IN`
 * with <N params, and we rely on the indexes added in migration 008.
 */

// ── Penalty weights ───────────────────────────────────────────────────
// Tuned for realistic false-positive tolerance:
//  - 1 other account on the same UPI is plausibly a family member.
//  - 3+ is almost certainly collusion.
// The scores compose additively, but the *total* linkage penalty is
// capped so a single strong signal can't alone declare RED — it should
// push a borderline claim over the edge, not fabricate one.
const MAX_LINKAGE_PENALTY = 60;

// Pure-function score calculators — exported for unit-testability later.

export function upiCollisionPenalty(otherWorkers: number): number {
  if (otherWorkers <= 0) return 0;
  if (otherWorkers === 1) return 15;
  if (otherWorkers === 2) return 25;
  return 40;
}

export function sharedDevicePenalty(otherWorkers: number): number {
  if (otherWorkers <= 0) return 0;
  if (otherWorkers === 1) return 10;
  if (otherWorkers === 2) return 20;
  return 35;
}

export function sharedIpPenalty(otherWorkers: number): number {
  if (otherWorkers <= 0) return 0;
  if (otherWorkers <= 2) return 5;
  if (otherWorkers <= 5) return 15;
  return 30;
}

export const SYNCHRONOUS_CLAIM_PENALTY = 25;
export const ZONE_BURST_PENALTY = 15;

// ── Output shapes ─────────────────────────────────────────────────────

export interface LinkedWorker {
  worker_id: string;
  name: string;
  mobile: string;
  platform: string | null;
  created_at: string;
}

export interface DeviceLink {
  fingerprint_hash: string;
  workers: LinkedWorker[];
}

export interface IpLink {
  ip_address: string;
  workers: LinkedWorker[];
  last_seen: string;
}

export interface UpiLink {
  payment_upi: string;
  workers: LinkedWorker[];
}

export interface LinkageResult {
  worker_id: string;
  shared_devices: DeviceLink[];
  shared_ips: IpLink[];
  shared_upis: UpiLink[];
  // Distinct union of every linked worker ID across all three signals.
  // This is the single number the BAS engine / admin UI wants to show.
  distinct_linked_workers: number;
  penalty: number;            // 0..MAX_LINKAGE_PENALTY, ready to add to fraud_score
  flags: string[];            // human-readable tags for admin explanations
}

/**
 * Full linkage graph for one worker. Used by:
 *  - Admin detail view (`GET /admin/workers/:id/linkage`)
 *  - Fraud engine's per-claim score penalty
 */
export async function analyzeWorkerLinkage(
  workerId: string,
): Promise<LinkageResult> {
  const flags: string[] = [];
  const [shared_devices, shared_ips, shared_upis] = await Promise.all([
    findSharedDevices(workerId),
    findSharedIps(workerId),
    findSharedUpis(workerId),
  ]);

  // Union of all linked worker ids (excluding self).
  const allLinked = new Set<string>();
  for (const d of shared_devices) for (const w of d.workers) allLinked.add(w.worker_id);
  for (const i of shared_ips) for (const w of i.workers) allLinked.add(w.worker_id);
  for (const u of shared_upis) for (const w of u.workers) allLinked.add(w.worker_id);

  // Per-signal penalty then cap.
  const deviceOthers = Math.max(...shared_devices.map((d) => d.workers.length), 0);
  const ipOthers = Math.max(...shared_ips.map((i) => i.workers.length), 0);
  const upiOthers = Math.max(...shared_upis.map((u) => u.workers.length), 0);

  const raw =
    sharedDevicePenalty(deviceOthers) +
    sharedIpPenalty(ipOthers) +
    upiCollisionPenalty(upiOthers);
  const penalty = Math.min(MAX_LINKAGE_PENALTY, raw);

  if (deviceOthers > 0) flags.push(`LINKED_DEVICE: ${deviceOthers} other worker(s)`);
  if (ipOthers > 0) flags.push(`LINKED_IP: ${ipOthers} other worker(s)`);
  if (upiOthers > 0) flags.push(`SHARED_UPI: ${upiOthers} other worker(s)`);
  if (allLinked.size >= 5) flags.push(`RING_CLUSTER: ${allLinked.size} linked accounts`);

  return {
    worker_id: workerId,
    shared_devices,
    shared_ips,
    shared_upis,
    distinct_linked_workers: allLinked.size,
    penalty,
    flags,
  };
}

// ── Signal 1: shared devices ──────────────────────────────────────────
async function findSharedDevices(workerId: string): Promise<DeviceLink[]> {
  // First: every fingerprint_hash this worker has ever used.
  const ownFps = await db('device_fingerprints')
    .where({ worker_id: workerId })
    .pluck<string[]>('fingerprint_hash');
  if (ownFps.length === 0) return [];

  // Then: every *other* worker who has used any of those fingerprints.
  const rows = await db('device_fingerprints as df')
    .innerJoin('workers as w', 'df.worker_id', 'w.id')
    .whereIn('df.fingerprint_hash', ownFps)
    .whereNot('df.worker_id', workerId)
    .select(
      'df.fingerprint_hash',
      'w.id as worker_id',
      'w.name',
      'w.mobile',
      'w.platform',
      'w.created_at',
    );

  return groupBy(rows, (r) => r.fingerprint_hash).map((group) => ({
    fingerprint_hash: group.key,
    workers: group.items.map(toLinkedWorker),
  }));
}

// ── Signal 2: shared IPs (last 7 days) ────────────────────────────────
async function findSharedIps(workerId: string): Promise<IpLink[]> {
  // Gate on whether the table exists — keeps this safe on envs that haven't
  // yet run migration 008.
  const hasTable = await db.schema.hasTable('worker_ip_log');
  if (!hasTable) return [];

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // IPs this worker has used recently.
  const ownIps = await db('worker_ip_log')
    .where({ worker_id: workerId })
    .where('last_seen_at', '>=', cutoff)
    .pluck<string[]>('ip_address');
  if (ownIps.length === 0) return [];

  // Other workers on the same IPs.
  const rows = await db('worker_ip_log as log')
    .innerJoin('workers as w', 'log.worker_id', 'w.id')
    .whereIn('log.ip_address', ownIps)
    .whereNot('log.worker_id', workerId)
    .where('log.last_seen_at', '>=', cutoff)
    .select(
      'log.ip_address',
      'log.last_seen_at',
      'w.id as worker_id',
      'w.name',
      'w.mobile',
      'w.platform',
      'w.created_at',
    );

  return groupBy(rows, (r) => r.ip_address).map((group) => ({
    ip_address: group.key,
    last_seen: toIsoString(
      group.items.reduce(
        (latest, r) => (new Date(r.last_seen_at) > new Date(latest) ? r.last_seen_at : latest),
        group.items[0].last_seen_at,
      ),
    ),
    workers: group.items.map(toLinkedWorker),
  }));
}

// ── Signal 3: shared UPI ──────────────────────────────────────────────
async function findSharedUpis(workerId: string): Promise<UpiLink[]> {
  const self = await db('workers').where({ id: workerId }).first();
  const upi = (self?.payment_upi as string | null) ?? null;
  if (!upi) return [];

  const rows = await db('workers')
    .where({ payment_upi: upi })
    .whereNot({ id: workerId })
    .select('id as worker_id', 'name', 'mobile', 'platform', 'created_at');

  if (rows.length === 0) return [];
  return [{ payment_upi: upi, workers: rows.map(toLinkedWorker) }];
}

// ── UPI collision check (used at policy-creation time) ────────────────
export interface UpiCollisionResult {
  /** How many *other* workers already use this UPI. */
  collision_count: number;
  /** IDs of those other workers. */
  worker_ids: string[];
  /** True if the policy create should be rejected outright. */
  block: boolean;
  /** True if it should be allowed through but flagged for admin review. */
  flag_for_review: boolean;
}

/**
 * Called synchronously during worker registration / policy creation.
 * Rule of thumb:
 *   - 0  collisions → allow freely.
 *   - 1  collision  → allow, flag for review (plausibly family).
 *   - 2+ collisions → hard block. A single UPI handle receiving payouts
 *     from 3 worker accounts is the textbook ring-fraud topology.
 */
export async function checkUpiCollision(
  upi: string,
  excludeWorkerId?: string,
): Promise<UpiCollisionResult> {
  const trimmed = upi.trim();
  if (!trimmed) {
    return { collision_count: 0, worker_ids: [], block: false, flag_for_review: false };
  }

  let q = db('workers').where({ payment_upi: trimmed });
  if (excludeWorkerId) q = q.whereNot({ id: excludeWorkerId });
  const rows = await q.select('id');

  const ids = rows.map((r) => r.id as string);
  return {
    collision_count: ids.length,
    worker_ids: ids,
    block: ids.length >= 2,
    flag_for_review: ids.length === 1,
  };
}

// ── Synchronous claims detector ───────────────────────────────────────
export interface SynchronousClaimsResult {
  claim_count: number;
  worker_count: number;
  worker_ids: string[];
  window_seconds: number;
  suspicious: boolean;
}

/**
 * Are multiple workers filing claims on the same disruption event within
 * a very short window? On a real rainfall event this is normal (workers
 * don't coordinate); the suspicion comes from combining this with the
 * linkage graph. So we only flag "suspicious" when:
 *   (a) ≥ 3 claims land within 120 s, AND
 *   (b) ≥ 2 of the involved workers are linked to at least one other
 *       worker via device/IP/UPI (i.e. the cluster isn't random).
 */
export async function detectSynchronousClaims(
  disruptionEventId: string,
  windowSeconds: number = 120,
): Promise<SynchronousClaimsResult> {
  const cutoff = new Date(Date.now() - windowSeconds * 1000);
  const rows = await db('claims')
    .where({ disruption_event_id: disruptionEventId })
    .where('created_at', '>=', cutoff)
    .select('worker_id');

  const workerIds = Array.from(new Set(rows.map((r) => r.worker_id as string)));
  const claim_count = rows.length;

  let suspicious = false;
  if (claim_count >= 3 && workerIds.length >= 3) {
    // Cheap cross-linkage check: any device or UPI shared across the set?
    suspicious = await anyCrossLinksInSet(workerIds);
  }

  return {
    claim_count,
    worker_count: workerIds.length,
    worker_ids: workerIds,
    window_seconds: windowSeconds,
    suspicious,
  };
}

async function anyCrossLinksInSet(workerIds: string[]): Promise<boolean> {
  if (workerIds.length < 2) return false;

  // Device cross-link: a fingerprint_hash appearing for ≥ 2 of the set.
  const dev = await db('device_fingerprints')
    .whereIn('worker_id', workerIds)
    .groupBy('fingerprint_hash')
    .havingRaw('count(distinct worker_id) >= 2')
    .select('fingerprint_hash')
    .first();
  if (dev) return true;

  // UPI cross-link: a payment_upi shared by ≥ 2 workers in the set.
  const upi = await db('workers')
    .whereIn('id', workerIds)
    .whereNotNull('payment_upi')
    .groupBy('payment_upi')
    .havingRaw('count(*) >= 2')
    .select('payment_upi')
    .first();
  if (upi) return true;

  // IP cross-link, if the table exists.
  try {
    const hasTable = await db.schema.hasTable('worker_ip_log');
    if (hasTable) {
      const ip = await db('worker_ip_log')
        .whereIn('worker_id', workerIds)
        .groupBy('ip_address')
        .havingRaw('count(distinct worker_id) >= 2')
        .select('ip_address')
        .first();
      if (ip) return true;
    }
  } catch {
    // missing table — move on.
  }

  return false;
}

// ── Zone burst detector ───────────────────────────────────────────────
export interface ZoneBurstResult {
  zone_id: string;
  current_count: number;
  baseline_per_hour: number;
  ratio: number;
  burst: boolean;
  window_minutes: number;
}

/**
 * Compare claim-rate in a zone over the last `windowMinutes` against the
 * 30-day per-hour baseline. Anything over 5× the baseline (with an
 * absolute-minimum floor of 5 claims in the window) counts as a burst.
 *
 * Why not just "too many claims in window"? A large zone on a real rainy
 * day will absolutely see 20 claims in an hour and that's legitimate.
 * The *ratio* versus this zone's own baseline is what separates "busy"
 * from "suspiciously busy."
 */
export async function detectZoneBurst(
  zoneId: string,
  windowMinutes: number = 60,
): Promise<ZoneBurstResult> {
  const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000);
  const baselineCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Current window: claims from any worker in this zone.
  const [currentRow] = await db('claims as c')
    .innerJoin('workers as w', 'c.worker_id', 'w.id')
    .where('w.delivery_zone_id', zoneId)
    .where('c.created_at', '>=', cutoff)
    .count<{ count: string }[]>('c.id as count');
  const current = Number(currentRow?.count ?? 0);

  // Baseline: 30-day average claims per hour in this zone.
  const [baselineRow] = await db('claims as c')
    .innerJoin('workers as w', 'c.worker_id', 'w.id')
    .where('w.delivery_zone_id', zoneId)
    .where('c.created_at', '>=', baselineCutoff)
    .count<{ count: string }[]>('c.id as count');
  const perHour = Number(baselineRow?.count ?? 0) / (30 * 24);

  const baselineForWindow = Math.max(0.5, perHour * (windowMinutes / 60));
  const ratio = current / baselineForWindow;
  const burst = current >= 5 && ratio >= 5;

  return {
    zone_id: zoneId,
    current_count: current,
    baseline_per_hour: Number(perHour.toFixed(3)),
    ratio: Number(ratio.toFixed(2)),
    burst,
    window_minutes: windowMinutes,
  };
}

// ── Small utils ───────────────────────────────────────────────────────
function toLinkedWorker(row: {
  worker_id: string;
  name: string;
  mobile: string;
  platform?: string | null;
  created_at: Date | string;
}): LinkedWorker {
  return {
    worker_id: row.worker_id,
    name: row.name,
    mobile: row.mobile,
    platform: row.platform ?? null,
    created_at: toIsoString(row.created_at),
  };
}

function toIsoString(v: Date | string): string {
  return typeof v === 'string' ? new Date(v).toISOString() : v.toISOString();
}

function groupBy<T, K extends string>(
  items: T[],
  keyFn: (item: T) => K,
): Array<{ key: K; items: T[] }> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = keyFn(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return Array.from(map.entries()).map(([key, items]) => ({ key, items }));
}
