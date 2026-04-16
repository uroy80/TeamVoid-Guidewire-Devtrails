import { Router, Response } from 'express';
import { requireAuth, requireAdmin, type AuthRequest } from '../middleware/auth.js';
import * as claimService from '../services/claim.service.js';
import * as auditService from '../services/audit.service.js';
import { db } from '../config/database.js';
import {
  generateRiskNarrative,
  generateClaimAssessment,
  generateFraudSummary,
} from '../external/openai.client.js';

const router = Router();

// All admin routes require auth + admin
router.use(requireAuth, requireAdmin);

/**
 * GET /admin/claims/review-queue
 * Flagged claims ordered by fraud score descending
 */
router.get('/claims/review-queue', async (_req: AuthRequest, res: Response) => {
  try {
    const claims = await claimService.getReviewQueue();
    res.json({ claims });
  } catch (err) {
    console.error('[AdminRoutes] Error fetching review queue:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /admin/claims/:id/resolve
 * Approve or reject a claim under review
 */
router.put('/claims/:id/resolve', async (req: AuthRequest, res: Response) => {
  try {
    const { approved, reason } = req.body;

    if (typeof approved !== 'boolean') {
      res.status(400).json({ error: 'approved (boolean) is required' });
      return;
    }

    const claim = await claimService.resolveReview(req.params.id, approved, reason);
    res.json({ claim });
  } catch (err: any) {
    if (err.message?.includes('not found')) {
      res.status(404).json({ error: err.message });
      return;
    }
    console.error('[AdminRoutes] Error resolving claim:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/audit-log
 * Query audit logs with optional filters
 */
router.get('/audit-log', async (req: AuthRequest, res: Response) => {
  try {
    const { entity_type, entity_id, limit, offset } = req.query;

    let query = db('audit_log').orderBy('created_at', 'desc');

    if (entity_type) {
      query = query.where('entity_type', entity_type as string);
    }
    if (entity_id) {
      query = query.where('entity_id', entity_id as string);
    }

    const pageLimit = Math.min(Number(limit) || 50, 200);
    const pageOffset = Number(offset) || 0;

    query = query.limit(pageLimit).offset(pageOffset);

    const logs = await query;
    res.json({ logs, limit: pageLimit, offset: pageOffset });
  } catch (err) {
    console.error('[AdminRoutes] Error fetching audit log:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/audit/verify
 * Verify the tamper-evident hash chain of the audit_log table.
 */
router.get('/audit/verify', async (_req: AuthRequest, res: Response) => {
  try {
    const result = await auditService.verifyAuditChain();
    res.json(result);
  } catch (err) {
    console.error('[AdminRoutes] Error verifying audit chain:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/workers
 * List all workers with zone, claim count, and active policy count
 */
router.get('/workers', async (_req: AuthRequest, res: Response) => {
  try {
    const workers = await db.raw(`
      SELECT w.*,
        dz.name as zone_name,
        (SELECT count(*) FROM claims c WHERE c.worker_id = w.id) as claim_count,
        (SELECT count(*) FROM policies p WHERE p.worker_id = w.id AND p.status = 'ACTIVE') as active_policy_count
      FROM workers w
      LEFT JOIN delivery_zones dz ON w.delivery_zone_id = dz.id
      ORDER BY w.created_at DESC
    `);
    res.json({ workers: workers.rows });
  } catch (err) {
    console.error('[AdminRoutes] Error fetching workers:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/workers/:id
 * Full worker details with policies, claims, and recent locations
 */
router.get('/workers/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const workerResult = await db.raw(`
      SELECT w.*, dz.name as zone_name
      FROM workers w
      LEFT JOIN delivery_zones dz ON w.delivery_zone_id = dz.id
      WHERE w.id = ?
    `, [id]);

    if (!workerResult.rows.length) {
      res.status(404).json({ error: 'Worker not found' });
      return;
    }

    const worker = workerResult.rows[0];

    const [policies, claims, locations] = await Promise.all([
      db('policies').where('worker_id', id).orderBy('created_at', 'desc'),
      db('claims').where('worker_id', id).orderBy('created_at', 'desc'),
      db('worker_location_log').where('worker_id', id).orderBy('recorded_at', 'desc').limit(20),
    ]);

    res.json({ worker, policies, claims, locations });
  } catch (err) {
    console.error('[AdminRoutes] Error fetching worker details:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /admin/workers/:id
 * Soft delete a worker by setting is_verified to false
 */
router.delete('/workers/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    await db('workers').where('id', id).update({ is_verified: false });
    res.json({ success: true });
  } catch (err) {
    console.error('[AdminRoutes] Error soft-deleting worker:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/stats
 * Aggregated platform statistics
 */
router.get('/stats', async (_req: AuthRequest, res: Response) => {
  try {
    const [
      workersResult,
      activePoliciesResult,
      policiesByTierResult,
      totalClaimsResult,
      claimsByStatusResult,
      totalPayoutsResult,
      fraudDetectionResult,
      avgBasResult,
    ] = await Promise.all([
      db('workers').count('id as count').first(),
      db('policies').where('status', 'ACTIVE').count('id as count').first(),
      db('policies').select('coverage_level').count('id as count').groupBy('coverage_level'),
      db('claims').count('id as count').first(),
      db('claims').select('status').count('id as count').groupBy('status'),
      db('claims')
        .whereIn('status', ['APPROVED', 'PAID'])
        .sum('income_loss_payout as total')
        .first(),
      db.raw(`
        SELECT
          count(*) FILTER (WHERE fraud_score > 50) as flagged,
          count(*) as total
        FROM claims
      `),
      db.raw(`
        SELECT avg((fraud_check_details->>'bas_score')::numeric) as avg_bas
        FROM claims
        WHERE fraud_check_details->>'bas_score' IS NOT NULL
      `),
    ]);

    const totalClaims = Number(totalClaimsResult?.count ?? 0);
    const flaggedCount = Number(fraudDetectionResult.rows[0]?.flagged ?? 0);
    const fraudDetectionRate = totalClaims > 0
      ? Math.round((flaggedCount / totalClaims) * 10000) / 100
      : 0;

    res.json({
      total_workers: Number(workersResult?.count ?? 0),
      active_policies: Number(activePoliciesResult?.count ?? 0),
      policies_by_tier: policiesByTierResult.map((r: any) => ({
        coverage_level: r.coverage_level,
        count: Number(r.count),
      })),
      total_claims: totalClaims,
      claims_by_status: claimsByStatusResult.map((r: any) => ({
        status: r.status,
        count: Number(r.count),
      })),
      total_payouts: Number(totalPayoutsResult?.total ?? 0),
      fraud_detection_rate: fraudDetectionRate,
      avg_bas_score: Number(Number(avgBasResult.rows[0]?.avg_bas ?? 0).toFixed(2)),
    });
  } catch (err) {
    console.error('[AdminRoutes] Error fetching stats:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/ai-insights
 * AI-generated summary of recent fraud patterns
 */
router.get('/ai-insights', async (_req: AuthRequest, res: Response) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const flaggedClaims = await db('claims')
      .where('fraud_score', '>', 30)
      .where('created_at', '>=', thirtyDaysAgo)
      .orderBy('created_at', 'desc');

    const summary = await generateFraudSummary(flaggedClaims);
    res.json({ summary });
  } catch (err) {
    console.error('[AdminRoutes] Error generating AI insights:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/workers/:id/ai-risk
 * AI-generated risk narrative for a specific worker
 */
router.get('/workers/:id/ai-risk', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const workerResult = await db.raw(`
      SELECT w.*,
        dz.name as zone_name,
        (SELECT count(*) FROM claims c WHERE c.worker_id = w.id) as claim_count,
        (SELECT count(*) FROM policies p WHERE p.worker_id = w.id AND p.status = 'ACTIVE') as active_policy_count
      FROM workers w
      LEFT JOIN delivery_zones dz ON w.delivery_zone_id = dz.id
      WHERE w.id = ?
    `, [id]);

    if (!workerResult.rows.length) {
      res.status(404).json({ error: 'Worker not found' });
      return;
    }

    const worker = workerResult.rows[0];
    const riskScore = worker.risk_score ?? 50;
    const zoneName = worker.zone_name ?? 'Unknown';

    const narrative = await generateRiskNarrative(worker, riskScore, zoneName);
    res.json({ narrative });
  } catch (err) {
    console.error('[AdminRoutes] Error generating AI risk narrative:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/claims/:id/ai-assessment
 * AI-generated assessment for a specific claim
 */
router.get('/claims/:id/ai-assessment', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const claim = await db('claims').where('id', id).first();
    if (!claim) {
      res.status(404).json({ error: 'Claim not found' });
      return;
    }

    const fraudDetails = claim.fraud_check_details ?? {};
    const assessment = await generateClaimAssessment(claim, fraudDetails);
    res.json({ assessment });
  } catch (err) {
    console.error('[AdminRoutes] Error generating AI claim assessment:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/heatmap
 * Regional worker distribution for heatmap visualization.
 * Returns lat/lng + worker count per zone.
 */
router.get('/heatmap', async (_req: AuthRequest, res: Response) => {
  try {
    const result = await db.raw(`
      SELECT
        dz.name as zone_name,
        dz.city,
        dz.latitude,
        dz.longitude,
        dz.base_risk,
        (SELECT count(*) FROM workers w2 WHERE w2.delivery_zone_id = dz.id) as worker_count,
        (SELECT count(*) FROM policies p2 JOIN workers w3 ON p2.worker_id = w3.id WHERE w3.delivery_zone_id = dz.id AND p2.status = 'ACTIVE') as active_policies,
        (SELECT count(*) FROM claims c2 JOIN workers w4 ON c2.worker_id = w4.id WHERE w4.delivery_zone_id = dz.id) as total_claims
      FROM delivery_zones dz
      WHERE dz.latitude != 0 AND dz.longitude != 0 AND dz.city != 'Unknown'
      ORDER BY worker_count DESC
    `);
    res.json({ zones: result.rows });
  } catch (err) {
    console.error('[AdminRoutes] Error fetching heatmap data:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /admin/reset
 * Nuclear reset — deletes all transactional data and resets to clean state.
 * Keeps: delivery_zones, dark_stores (reference data). Deletes everything else.
 */
router.post('/reset', async (_req: AuthRequest, res: Response) => {
  try {
    // Delete in order respecting foreign keys
    await db('audit_log').del();
    await db('financial_ledger').del();
    await db('payouts').del();
    await db('claims').del();
    await db('disruption_events').del();
    await db('worker_location_log').del();
    await db('device_fingerprints').del();
    await db('policies').del();
    await db('otp_records').del();
    await db('workers').del();

    res.json({
      success: true,
      message: 'All data has been reset. Clean slate.',
      deleted: ['audit_log', 'financial_ledger', 'payouts', 'claims', 'disruption_events', 'worker_location_log', 'device_fingerprints', 'policies', 'otp_records', 'workers'],
    });
  } catch (err) {
    console.error('[AdminRoutes] Error resetting data:', err);
    res.status(500).json({ error: 'Reset failed: ' + (err as Error).message });
  }
});

export default router;
