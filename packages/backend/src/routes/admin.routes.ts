import { Router, Response } from 'express';
import { requireAuth, requireAdmin, type AuthRequest } from '../middleware/auth.js';
import * as claimService from '../services/claim.service.js';
import * as auditService from '../services/audit.service.js';
import * as linkageService from '../services/linkage.service.js';
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
 * GET /admin/workers/:id/linkage
 * Full ring-fraud linkage graph: every other worker this one shares a
 * device, IP, or UPI handle with. Used by the admin detail view to
 * render the connection graph.
 */
router.get('/workers/:id/linkage', async (req: AuthRequest, res: Response) => {
  try {
    const linkage = await linkageService.analyzeWorkerLinkage(req.params.id);
    res.json({ linkage });
  } catch (err) {
    console.error('[AdminRoutes] Error fetching worker linkage:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/ring-fraud/hotspots
 * Lists UPI handles / IPs / devices that currently connect 3+ workers.
 * This is the "show me the rings" view for fraud ops.
 */
router.get('/ring-fraud/hotspots', async (_req: AuthRequest, res: Response) => {
  try {
    // UPI hotspots: a payment_upi tied to 3+ workers.
    const upiRows = await db('workers')
      .whereNotNull('payment_upi')
      .groupBy('payment_upi')
      .havingRaw('count(*) >= 3')
      .select('payment_upi')
      .count<{ payment_upi: string; count: string }[]>('id as count');

    const upiHotspots = await Promise.all(
      upiRows.map(async (r) => {
        const workers = await db('workers')
          .where({ payment_upi: r.payment_upi })
          .select('id', 'name', 'mobile', 'platform', 'created_at');
        return { payment_upi: r.payment_upi, workers };
      }),
    );

    // Device hotspots: a fingerprint_hash tied to 3+ workers.
    const deviceRows = await db('device_fingerprints')
      .groupBy('fingerprint_hash')
      .havingRaw('count(distinct worker_id) >= 3')
      .select('fingerprint_hash')
      .countDistinct<{ fingerprint_hash: string; count: string }[]>('worker_id as count');

    const deviceHotspots = await Promise.all(
      deviceRows.map(async (r) => {
        const workers = await db('device_fingerprints as df')
          .innerJoin('workers as w', 'df.worker_id', 'w.id')
          .where('df.fingerprint_hash', r.fingerprint_hash)
          .select('w.id', 'w.name', 'w.mobile', 'w.platform', 'w.created_at')
          .distinctOn('w.id');
        return { fingerprint_hash: r.fingerprint_hash, workers };
      }),
    );

    // IP hotspots (last 7d): an IP seen by 3+ workers.
    let ipHotspots: Array<{ ip_address: string; workers: unknown[] }> = [];
    try {
      const hasTable = await db.schema.hasTable('worker_ip_log');
      if (hasTable) {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const ipRows = await db('worker_ip_log')
          .where('last_seen_at', '>=', sevenDaysAgo)
          .groupBy('ip_address')
          .havingRaw('count(distinct worker_id) >= 3')
          .select('ip_address');

        ipHotspots = await Promise.all(
          ipRows.map(async (r) => {
            const workers = await db('worker_ip_log as log')
              .innerJoin('workers as w', 'log.worker_id', 'w.id')
              .where('log.ip_address', r.ip_address)
              .where('log.last_seen_at', '>=', sevenDaysAgo)
              .select('w.id', 'w.name', 'w.mobile', 'w.platform', 'w.created_at')
              .distinctOn('w.id');
            return { ip_address: r.ip_address, workers };
          }),
        );
      }
    } catch (err) {
      console.warn('[AdminRoutes] IP hotspot scan failed:', err);
    }

    res.json({
      upi_hotspots: upiHotspots,
      device_hotspots: deviceHotspots,
      ip_hotspots: ipHotspots,
    });
  } catch (err) {
    console.error('[AdminRoutes] Error computing ring-fraud hotspots:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/workers/:id/delete-preview
 * Returns counts of dependent rows that will be removed by a hard delete.
 * Used by the frontend confirmation modal.
 */
router.get('/workers/:id/delete-preview', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const worker = await db('workers').where('id', id).first();
    if (!worker) {
      res.status(404).json({ error: 'Worker not found' });
      return;
    }

    // Count rows across each dependent table. Wrap optional tables in try/catch
    // in case they haven't been migrated in some environments.
    const countSafe = async (tableName: string, col: string = 'worker_id'): Promise<number> => {
      try {
        const r = await db(tableName).where(col, id).count('* as c').first();
        return Number(r?.c ?? 0);
      } catch {
        return 0;
      }
    };

    const [
      payouts,
      claims,
      policies,
      financial_ledger,
      worker_location_log,
      device_fingerprints,
      community_reports,
      refresh_tokens,
    ] = await Promise.all([
      countSafe('payouts'),
      countSafe('claims'),
      countSafe('policies'),
      countSafe('financial_ledger'),
      countSafe('worker_location_log'),
      countSafe('device_fingerprints'),
      countSafe('community_reports'),
      countSafe('refresh_tokens'),
    ]);

    res.json({
      worker: {
        id: worker.id,
        name: worker.name,
        mobile_number: worker.mobile,
      },
      counts: {
        payouts,
        claims,
        policies,
        financial_ledger,
        worker_location_log,
        device_fingerprints,
        community_reports,
        refresh_tokens,
      },
      total: payouts + claims + policies + financial_ledger + worker_location_log +
             device_fingerprints + community_reports + refresh_tokens,
    });
  } catch (err) {
    console.error('[AdminRoutes] Error building delete preview:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /admin/workers/:id
 * Transactional hard delete: cascades across every table that references the worker,
 * then appends an entry to the tamper-evident audit log.
 */
router.delete('/workers/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const worker = await db('workers').where('id', id).first();
    if (!worker) {
      res.status(404).json({ error: 'Worker not found' });
      return;
    }

    // Helper: delete from a table only if it exists — the set of tables may vary
    // between dev/prod/seed environments.
    const delSafe = async (trx: any, tableName: string, col: string = 'worker_id') => {
      try {
        return await trx(tableName).where(col, id).del();
      } catch {
        return 0;
      }
    };

    let summary: Record<string, number> = {};

    await db.transaction(async (trx) => {
      // Order matters: descendants first, then parents
      summary.payouts = await delSafe(trx, 'payouts');
      summary.claims = await delSafe(trx, 'claims');
      summary.policies = await delSafe(trx, 'policies');
      summary.financial_ledger = await delSafe(trx, 'financial_ledger');
      summary.community_reports = await delSafe(trx, 'community_reports');
      summary.device_fingerprints = await delSafe(trx, 'device_fingerprints');
      summary.worker_location_log = await delSafe(trx, 'worker_location_log');
      summary.refresh_tokens = await delSafe(trx, 'refresh_tokens');
      summary.workers = await trx('workers').where('id', id).del();
    });

    // Append to tamper-evident audit log (best effort; don't fail the request)
    try {
      await auditService.appendAuditEntry({
        actor_id: req.workerId ?? 'admin',
        action: 'WORKER_HARD_DELETE',
        resource_type: 'worker',
        resource_id: id,
        metadata: {
          mobile_number: worker.mobile,
          name: worker.name,
          cascade_summary: summary,
        },
      });
    } catch (auditErr) {
      console.error('[AdminRoutes] Audit append failed (non-fatal):', auditErr);
    }

    res.json({ success: true, deleted: summary });
  } catch (err) {
    console.error('[AdminRoutes] Error hard-deleting worker:', err);
    res.status(500).json({ error: 'Internal server error: ' + (err as Error).message });
  }
});

/**
 * GET /admin/claims
 * Paginated list of all claims for the admin Claims tab.
 * Supports optional ?status= filter (PENDING, APPROVED, REJECTED, PAID, FLAGGED, UNDER_REVIEW).
 */
router.get('/claims', async (req: AuthRequest, res: Response) => {
  try {
    const { status, limit, offset } = req.query;
    const pageLimit = Math.min(Number(limit) || 50, 200);
    const pageOffset = Number(offset) || 0;

    // Join the disruption_events row that the claim was generated against —
    // that's where event_type/severity live (claims table doesn't carry them).
    // We also join the event's zone so admins see where the disruption hit,
    // not where the worker happens to be based.
    let query = db('claims as c')
      .leftJoin('workers as w', 'c.worker_id', 'w.id')
      .leftJoin('policies as p', 'c.policy_id', 'p.id')
      .leftJoin('disruption_events as de', 'c.disruption_event_id', 'de.id')
      .leftJoin('delivery_zones as edz', 'de.delivery_zone_id', 'edz.id')
      .leftJoin('delivery_zones as wdz', 'w.delivery_zone_id', 'wdz.id')
      .select(
        'c.*',
        'w.name as worker_name',
        'w.mobile as worker_mobile',
        'p.coverage_level as policy_tier',
        'de.event_type as event_type',
        'de.severity as severity',
        'de.event_timestamp as event_timestamp',
        'de.verified_by_sources as event_sources',
        // Coalesce: prefer event's zone (the place the disruption happened),
        // fall back to worker's home zone so the column is never empty.
        db.raw('COALESCE(edz.name, wdz.name) as zone_name'),
      )
      .orderBy('c.created_at', 'desc');

    if (status) {
      query = query.where('c.status', String(status).toUpperCase());
    }

    const claims = await query.limit(pageLimit).offset(pageOffset);
    const totalRow = await db('claims').count('id as c').first();

    res.json({
      claims,
      total: Number(totalRow?.c ?? 0),
      limit: pageLimit,
      offset: pageOffset,
    });
  } catch (err) {
    console.error('[AdminRoutes] Error listing claims:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/claims/:id
 * Full claim detail for the admin Claims tab.
 */
router.get('/claims/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const claim = await db('claims as c')
      .leftJoin('workers as w', 'c.worker_id', 'w.id')
      .leftJoin('policies as p', 'c.policy_id', 'p.id')
      .leftJoin('disruption_events as de', 'c.disruption_event_id', 'de.id')
      .leftJoin('delivery_zones as edz', 'de.delivery_zone_id', 'edz.id')
      .leftJoin('delivery_zones as wdz', 'w.delivery_zone_id', 'wdz.id')
      .select(
        'c.*',
        'w.name as worker_name',
        'w.mobile as worker_mobile',
        'p.coverage_level as policy_tier',
        'de.event_type as event_type',
        'de.severity as severity',
        'de.event_timestamp as event_timestamp',
        'de.verified_by_sources as event_sources',
        'de.duration_estimate_hours as event_duration_hours',
        db.raw('COALESCE(edz.name, wdz.name) as zone_name'),
      )
      .where('c.id', id)
      .first();

    if (!claim) {
      res.status(404).json({ error: 'Claim not found' });
      return;
    }

    res.json({ claim });
  } catch (err) {
    console.error('[AdminRoutes] Error fetching claim:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /admin/claims/:id/approve
 * Admin approves a claim regardless of current status.
 */
router.post('/claims/:id/approve', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body ?? {};
    const claim = await claimService.resolveReview(id, true, reason ?? 'Approved by admin');

    try {
      await auditService.appendAuditEntry({
        actor_id: req.workerId ?? 'admin',
        action: 'CLAIM_APPROVE',
        resource_type: 'claim',
        resource_id: id,
        metadata: { reason: reason ?? null },
      });
    } catch {
      /* non-fatal */
    }

    res.json({ claim });
  } catch (err: any) {
    if (err.message?.includes('not found')) {
      res.status(404).json({ error: err.message });
      return;
    }
    console.error('[AdminRoutes] Error approving claim:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /admin/claims/:id/reject
 * Admin rejects a claim regardless of current status.
 */
router.post('/claims/:id/reject', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body ?? {};
    const claim = await claimService.resolveReview(id, false, reason ?? 'Rejected by admin');

    try {
      await auditService.appendAuditEntry({
        actor_id: req.workerId ?? 'admin',
        action: 'CLAIM_REJECT',
        resource_type: 'claim',
        resource_id: id,
        metadata: { reason: reason ?? null },
      });
    } catch {
      /* non-fatal */
    }

    res.json({ claim });
  } catch (err: any) {
    if (err.message?.includes('not found')) {
      res.status(404).json({ error: err.message });
      return;
    }
    console.error('[AdminRoutes] Error rejecting claim:', err);
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
