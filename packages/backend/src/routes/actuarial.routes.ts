import { Router, Response } from 'express';
import { requireAuth, requireRole, type AuthRequest } from '../middleware/auth.js';
import * as actuarial from '../services/actuarial.service.js';
import { redis } from '../config/redis.js';
import { logger } from '../lib/logger.js';

const router = Router();

const ALLOWED_ROLES = ['ADMIN', 'UNDERWRITER', 'COMPLIANCE'] as const;
const CACHE_TTL_SECONDS = 300;

router.use(requireAuth, requireRole(...ALLOWED_ROLES));

async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (err) {
    logger.warn({ err, key }, 'actuarial cache read failed');
    return null;
  }
}

async function cacheSet<T>(key: string, value: T): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), 'EX', CACHE_TTL_SECONDS);
  } catch (err) {
    logger.warn({ err, key }, 'actuarial cache write failed');
  }
}

/**
 * GET /api/admin/actuarial/overview
 * Loss ratio (trailing 90d), UPR, IBNR, solvency — the one-shot dashboard tile.
 */
router.get('/overview', async (_req: AuthRequest, res: Response) => {
  const cacheKey = 'actuarial:overview:v1';
  const cached = await cacheGet<Record<string, unknown>>(cacheKey);
  if (cached) {
    res.set('X-Cache', 'HIT').json(cached);
    return;
  }

  try {
    const to = new Date();
    const from = new Date(to.getTime() - 90 * 24 * 3600 * 1000);
    const [lossRatio, upr, ibnr, solvency] = await Promise.all([
      actuarial.getLossRatio(from, to),
      actuarial.getUPR(),
      actuarial.getIBNR(),
      actuarial.getSolvencyMetrics(),
    ]);
    const body = { loss_ratio: lossRatio, upr, ibnr, solvency };
    await cacheSet(cacheKey, body);
    res.set('X-Cache', 'MISS').json(body);
  } catch (err) {
    logger.error({ err }, 'actuarial overview failed');
    res.status(500).json({ error: 'Failed to compute actuarial overview' });
  }
});

/**
 * GET /api/admin/actuarial/by-zone
 * Per-zone loss ratio snapshot for the last 90 days.
 */
router.get('/by-zone', async (_req: AuthRequest, res: Response) => {
  const cacheKey = 'actuarial:by-zone:v1';
  const cached = await cacheGet<{ zones: unknown[] }>(cacheKey);
  if (cached) {
    res.set('X-Cache', 'HIT').json(cached);
    return;
  }

  try {
    const zones = await actuarial.getByZone();
    const body = { zones };
    await cacheSet(cacheKey, body);
    res.set('X-Cache', 'MISS').json(body);
  } catch (err) {
    logger.error({ err }, 'actuarial by-zone failed');
    res.status(500).json({ error: 'Failed to compute per-zone actuarial view' });
  }
});

/**
 * GET /api/admin/actuarial/loss-ratio
 * Ad-hoc loss-ratio query. Not cached (arbitrary windows would blow cardinality).
 */
router.get('/loss-ratio', async (req: AuthRequest, res: Response) => {
  try {
    const { from, to, zone_id } = req.query;

    const toDate = typeof to === 'string' ? new Date(to) : new Date();
    const fromDate = typeof from === 'string' ? new Date(from) : new Date(toDate.getTime() - 90 * 24 * 3600 * 1000);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      res.status(400).json({ error: 'Invalid from/to date' });
      return;
    }

    const zoneId = typeof zone_id === 'string' && zone_id.length > 0 ? zone_id : undefined;
    const result = await actuarial.getLossRatio(fromDate, toDate, zoneId);
    res.json(result);
  } catch (err) {
    logger.error({ err }, 'actuarial loss-ratio failed');
    res.status(500).json({ error: 'Failed to compute loss ratio' });
  }
});

export default router;
