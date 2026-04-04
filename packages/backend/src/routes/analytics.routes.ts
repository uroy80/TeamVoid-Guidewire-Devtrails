import { Router, Response } from 'express';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth.js';
import { db } from '../config/database.js';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// GET /worker/summary - worker analytics
router.get('/worker/summary', async (req: AuthRequest, res: Response) => {
  try {
    const workerId = req.workerId!;

    // Total claims and payouts
    const claimStats = await db('claims')
      .where({ worker_id: workerId })
      .select(
        db.raw('COUNT(*)::int as total_claims'),
        db.raw('COUNT(*) FILTER (WHERE status = ?) ::int as approved_claims', ['APPROVED']),
        db.raw('COUNT(*) FILTER (WHERE status = ?) ::int as paid_claims', ['PAID']),
        db.raw('COUNT(*) FILTER (WHERE status = ?) ::int as rejected_claims', ['REJECTED'])
      )
      .first();

    const payoutStats = await db('payouts')
      .where({ worker_id: workerId, status: 'SUCCESS' })
      .select(db.raw('COALESCE(SUM(amount), 0)::numeric as total_payouts'))
      .first();

    // Active policy info
    const activePolicy = await db('policies')
      .where({ worker_id: workerId, status: 'ACTIVE' })
      .select('id', 'policy_number', 'coverage_level', 'weekly_premium', 'coverage_period_end', 'auto_renew')
      .first();

    // Worker risk info
    const worker = await db('workers')
      .where({ id: workerId })
      .select('risk_score', 'risk_tier', 'platform_rating')
      .first();

    res.json({
      claims: claimStats,
      total_payouts: Number(payoutStats?.total_payouts ?? 0),
      active_policy: activePolicy ?? null,
      risk: worker ?? null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/overview - admin analytics overview (admin only)
router.get('/admin/overview', requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    // Total policies by status
    const policyStats = await db('policies')
      .select('status')
      .count('* as count')
      .groupBy('status');

    const totalPolicies = policyStats.reduce((sum, row) => sum + Number(row.count), 0);

    // Claims by status
    const claimsByStatus = await db('claims')
      .select('status')
      .count('* as count')
      .groupBy('status');

    const totalClaims = claimsByStatus.reduce((sum, row) => sum + Number(row.count), 0);

    // Total payouts
    const payoutStats = await db('payouts')
      .where({ status: 'SUCCESS' })
      .select(db.raw('COALESCE(SUM(amount), 0)::numeric as total_payouts'))
      .first();

    // Total premium income
    const premiumIncome = await db('financial_ledger')
      .where({ direction: 'INFLOW', type: 'PREMIUM_PAYMENT' })
      .select(db.raw('COALESCE(SUM(amount), 0)::numeric as total_premiums'))
      .first();

    const totalPayouts = Number(payoutStats?.total_payouts ?? 0);
    const totalPremiums = Number(premiumIncome?.total_premiums ?? 0);
    const lossRatio = totalPremiums > 0
      ? Math.round((totalPayouts / totalPremiums) * 10000) / 100
      : 0;

    res.json({
      total_policies: totalPolicies,
      policies_by_status: Object.fromEntries(policyStats.map((r) => [r.status, Number(r.count)])),
      total_claims: totalClaims,
      claims_by_status: Object.fromEntries(claimsByStatus.map((r) => [r.status, Number(r.count)])),
      total_payouts: totalPayouts,
      total_premiums: totalPremiums,
      loss_ratio_pct: lossRatio,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/fraud - admin fraud analytics (admin only)
router.get('/admin/fraud', requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    // Flagged claims (fraud_score > 60)
    const flaggedClaims = await db('claims')
      .where('fraud_score', '>', 60)
      .select(
        db.raw('COUNT(*)::int as flagged_count'),
        db.raw('AVG(fraud_score)::numeric as avg_fraud_score')
      )
      .first();

    // GPS spoof attempts from fraud_check_details
    const gpsSpoofAttempts = await db('claims')
      .whereNotNull('fraud_check_details')
      .whereRaw("(fraud_check_details->>'gps_authenticity')::numeric < 50")
      .count('* as count')
      .first();

    // BAS (Behavioral Authenticity Score) tier distribution
    const basDistribution = await db('claims')
      .whereNotNull('fraud_check_details')
      .select(db.raw("fraud_check_details->>'tier' as bas_tier"))
      .count('* as count')
      .groupBy(db.raw("fraud_check_details->>'tier'"));

    // Recent flagged claims for review
    const recentFlagged = await db('claims')
      .where('fraud_score', '>', 60)
      .join('workers', 'claims.worker_id', 'workers.id')
      .select(
        'claims.id',
        'claims.claim_number',
        'claims.fraud_score',
        'claims.status',
        'claims.fraud_check_details',
        'workers.name as worker_name',
        'claims.created_at'
      )
      .orderBy('claims.fraud_score', 'desc')
      .limit(20);

    res.json({
      flagged_claims_count: flaggedClaims?.flagged_count ?? 0,
      avg_fraud_score_flagged: Math.round(Number(flaggedClaims?.avg_fraud_score ?? 0) * 100) / 100,
      gps_spoof_attempts: Number(gpsSpoofAttempts?.count ?? 0),
      bas_distribution: Object.fromEntries(
        basDistribution.map((r: any) => [r.bas_tier ?? 'UNKNOWN', Number(r.count)])
      ),
      recent_flagged: recentFlagged,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
