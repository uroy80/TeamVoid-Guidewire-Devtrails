import type { NextFunction, Response } from 'express';
import type { AuthRequest } from './auth.js';
import { db } from '../config/database.js';

/**
 * IP logger — writes an entry to `worker_ip_log` for every authenticated
 * request. This is the data source the ring-fraud detector uses to find
 * "N workers ever seen on the same public IP" — the single strongest
 * collusion signal we have now that devices can be reset between accounts.
 *
 * Design constraints:
 *  1. Zero request latency. We run via `res.on('finish')` so the work
 *     happens after the response has been flushed to the client.
 *  2. Don't hammer the DB. A tight request loop (e.g. the admin stats
 *     refresh polling every 10s) would otherwise write the same row N
 *     times per minute. We keep an in-process LRU and skip DB if we've
 *     written within `DEDUP_WINDOW_MS`.
 *  3. Fail silently. IP logging is a fraud signal, not a correctness
 *     dependency — if the table doesn't exist or the write fails, the
 *     request must not see an error.
 *  4. Don't log when we have no worker id. Anonymous / admin-token
 *     (hardcoded workerId='admin') / registration-temptoken (no
 *     workerId) requests are skipped.
 */
const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_ENTRIES = 5000;

// A naive LRU: Map iteration is insertion-ordered, so we evict the
// oldest key whenever we pass the cap. We don't need perfect LRU
// semantics — staleness just means an extra DB upsert, not a bug.
const recentWrites = new Map<string, number>();

function markSeen(cacheKey: string, now: number): boolean {
  const prev = recentWrites.get(cacheKey);
  if (prev !== undefined && now - prev < DEDUP_WINDOW_MS) return false;

  recentWrites.set(cacheKey, now);
  if (recentWrites.size > MAX_CACHE_ENTRIES) {
    // Evict the oldest (first-inserted) entry.
    const oldest = recentWrites.keys().next().value;
    if (oldest !== undefined) recentWrites.delete(oldest);
  }
  return true;
}

function extractClientIp(req: AuthRequest): string | undefined {
  // Trust `X-Forwarded-For` when present (the app runs behind the Hostinger
  // nginx reverse proxy in prod; without this every request logs as 172.17.0.1).
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.socket?.remoteAddress ?? undefined;
}

/** Workers have UUID ids; anything else (e.g. the bootstrap 'admin' account) is skipped. */
function isValidUuid(v: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
    v,
  );
}

/**
 * Register this globally (after `express.json()` is fine — we only use
 * headers and `req.socket`). It installs a `res.on('finish')` hook that
 * reads `req.workerId` (populated by `authenticate`) and upserts a row.
 */
export function ipLogger(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  res.on('finish', () => {
    const workerId = req.workerId;
    if (!workerId || !isValidUuid(workerId)) return;

    const ip = extractClientIp(req);
    if (!ip) return;

    const cacheKey = `${workerId}|${ip}`;
    const now = Date.now();
    if (!markSeen(cacheKey, now)) return; // deduped — nothing to do

    const userAgent = typeof req.headers['user-agent'] === 'string'
      ? req.headers['user-agent'].slice(0, 500)
      : null;
    const route = `${req.method} ${req.baseUrl ?? ''}${req.path ?? ''}`.slice(0, 100);

    // Fire-and-forget. Swallow all errors — missing table on a fresh
    // environment should never surface as a 500 to the end user.
    void upsertIpLog(workerId, ip, userAgent, route).catch(() => {});
  });

  next();
}

async function upsertIpLog(
  workerId: string,
  ipAddress: string,
  userAgent: string | null,
  route: string,
): Promise<void> {
  // PostgreSQL upsert: one round trip, handles both first-seen and
  // subsequent-seen via ON CONFLICT on (worker_id, ip_address).
  await db.raw(
    `INSERT INTO worker_ip_log (worker_id, ip_address, user_agent, route, first_seen_at, last_seen_at, seen_count)
     VALUES (?, ?, ?, ?, now(), now(), 1)
     ON CONFLICT (worker_id, ip_address) DO UPDATE
       SET last_seen_at = now(),
           seen_count   = worker_ip_log.seen_count + 1,
           user_agent   = COALESCE(EXCLUDED.user_agent, worker_ip_log.user_agent),
           route        = COALESCE(EXCLUDED.route, worker_ip_log.route)`,
    [workerId, ipAddress, userAgent, route],
  );
}
