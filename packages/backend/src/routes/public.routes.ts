import { Router, Request, Response } from 'express';
import { db } from '../config/database.js';
import { redis } from '../config/redis.js';

const router = Router();

const STATS_CACHE_KEY = 'public:stats:v1';
const STATS_CACHE_TTL_SECONDS = 60;

/**
 * GET /api/public/stats
 *
 * No-auth endpoint used on the Welcome page to show live counters
 * (workers protected, zones covered, total payouts, etc).
 *
 * Cached in Redis for 60s so we never hammer the DB if this becomes a
 * hot path when traffic spikes during demos.
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const cached = await redis.get(STATS_CACHE_KEY).catch(() => null);
    if (cached) {
      res.json(JSON.parse(cached));
      return;
    }

    const [
      workersRow,
      activePoliciesRow,
      payoutsRow,
      zonesRow,
      claimsRow,
      lastPayoutRow,
    ] = await Promise.all([
      db('workers').count<{ c: string }>('* as c').first(),
      db('policies').where({ status: 'ACTIVE' }).count<{ c: string }>('* as c').first(),
      db('claims').whereIn('status', ['APPROVED', 'PAID']).sum<{ s: string }>('income_loss_payout as s').first(),
      db('delivery_zones').whereNot('city', 'Unknown').where('latitude', '!=', 0).count<{ c: string }>('* as c').first(),
      db('claims').count<{ c: string }>('* as c').first(),
      db('claims').whereIn('status', ['APPROVED', 'PAID']).orderBy('updated_at', 'desc').select('updated_at').first(),
    ]);

    const lastPayoutAgo = lastPayoutRow?.updated_at
      ? Math.floor((Date.now() - new Date(lastPayoutRow.updated_at as unknown as string).getTime()) / 1000)
      : null;

    const stats = {
      total_workers: Number(workersRow?.c ?? 0),
      active_policies: Number(activePoliciesRow?.c ?? 0),
      total_payouts: Number(payoutsRow?.s ?? 0),
      zones_covered: Number(zonesRow?.c ?? 0),
      claims_processed: Number(claimsRow?.c ?? 0),
      last_payout_ago_seconds: lastPayoutAgo,
      generated_at: new Date().toISOString(),
    };

    // Fire-and-forget cache write
    redis.set(STATS_CACHE_KEY, JSON.stringify(stats), 'EX', STATS_CACHE_TTL_SECONDS).catch(() => { /* */ });

    res.json(stats);
  } catch (err) {
    console.error('[PublicRoutes] Stats error:', err);
    // Always return something sensible — this is a public page, never 500
    res.json({
      total_workers: 0,
      active_policies: 0,
      total_payouts: 0,
      zones_covered: 0,
      claims_processed: 0,
      last_payout_ago_seconds: null,
      generated_at: new Date().toISOString(),
    });
  }
});

export default router;
