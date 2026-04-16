import type { Request, Response, NextFunction } from 'express';
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';
import { db } from '../config/database.js';
import { events, type EventPayload } from '../services/events.service.js';
import { logger } from '../lib/logger.js';

// Use a dedicated registry so we can control what is exposed and avoid
// collisions in tests / multiple imports.
export const register = new Registry();
register.setDefaultLabels({ service: 'gigshield-api' });

collectDefaultMetrics({ register });

// --- HTTP histogram -------------------------------------------------------
const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

// --- Event counter --------------------------------------------------------
const eventsTotal = new Counter({
  name: 'gigshield_events_total',
  help: 'Total number of internal events emitted by the event bus',
  labelNames: ['event_type'] as const,
  registers: [register],
});

// --- Claim / payout counters ---------------------------------------------
const claimsTotal = new Counter({
  name: 'gigshield_claims_total',
  help: 'Total number of claims by status',
  labelNames: ['status'] as const,
  registers: [register],
});

const payoutsTotal = new Counter({
  name: 'gigshield_payouts_total',
  help: 'Total number of payouts by status',
  labelNames: ['status'] as const,
  registers: [register],
});

// --- Active policies gauge -----------------------------------------------
const activePolicies = new Gauge({
  name: 'gigshield_active_policies',
  help: 'Number of policies currently in ACTIVE status',
  registers: [register],
});

async function refreshActivePolicies(): Promise<void> {
  try {
    const row = await db('policies').where({ status: 'ACTIVE' }).count<{ count: string }[]>('id as count').first();
    const count = Number(row?.count ?? 0);
    activePolicies.set(count);
  } catch (err) {
    logger.warn({ err }, 'failed to refresh gigshield_active_policies gauge');
  }
}

// Fire once at startup, then every 60s. Unref so tests / shutdown aren't blocked.
void refreshActivePolicies();
const activePoliciesTimer = setInterval(refreshActivePolicies, 60_000);
if (typeof activePoliciesTimer.unref === 'function') activePoliciesTimer.unref();

// --- Event bus subscription ----------------------------------------------
events.on('event', (payload: EventPayload) => {
  try {
    eventsTotal.labels(payload.type).inc();

    // Auto-bump claim / payout counters from event bus so we don't have to
    // modify claim.service.ts or payout.service.ts directly.
    if (payload.type === 'CLAIM_CREATED') {
      const status = typeof payload.data?.status === 'string' ? (payload.data.status as string) : 'CREATED';
      claimsTotal.labels(status).inc();
    }
    if (payload.type === 'PAYOUT_SENT') {
      const status = typeof payload.data?.status === 'string' ? (payload.data.status as string) : 'SUCCESS';
      payoutsTotal.labels(status).inc();
    }
  } catch (err) {
    logger.warn({ err }, 'metrics event listener failed');
  }
});

// --- Express middleware ---------------------------------------------------
/**
 * Records request duration + status_code for every HTTP request.
 * Must be registered BEFORE routes so res.finish fires after route handling.
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    // Prefer the matched route pattern (e.g. "/api/claims/:id") over the raw URL
    // so we don't blow up cardinality with every UUID.
    const routePath =
      (req.route && typeof req.route.path === 'string' ? req.route.path : undefined) ||
      req.baseUrl ||
      req.path ||
      'unknown';
    end({
      method: req.method,
      route: routePath,
      status_code: String(res.statusCode),
    });
  });
  next();
}

/**
 * Express handler for `GET /metrics`. No auth — internal/ops scraping only.
 */
export async function metricsHandler(_req: Request, res: Response): Promise<void> {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(`# metrics collection failed: ${(err as Error).message}`);
  }
}
