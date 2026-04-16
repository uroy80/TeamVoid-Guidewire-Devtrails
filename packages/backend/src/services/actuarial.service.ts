import { db } from '../config/database.js';

/**
 * Actuarial & solvency analytics.
 *
 * These are simple back-of-envelope calculations intended for an internal
 * ops dashboard — they are NOT regulatory-grade. The underlying schema uses
 * `policies.weekly_premium` as the written premium figure.
 */

export interface LossRatio {
  gross_written_premium: number;
  claims_paid: number;
  loss_ratio: number;
  claim_count: number;
  policy_count: number;
  from?: string;
  to?: string;
  zone_id?: string;
}

function toNum(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Loss ratio = claims paid / gross written premium over a window.
 * Optionally scoped to one delivery zone.
 */
export async function getLossRatio(
  fromDate: Date,
  toDate: Date,
  zoneId?: string,
): Promise<LossRatio> {
  const policyQuery = db('policies')
    .where('created_at', '>=', fromDate)
    .where('created_at', '<=', toDate);

  if (zoneId) {
    policyQuery.whereIn('worker_id', db('workers').select('id').where({ delivery_zone_id: zoneId }));
  }

  const gwpRow = await policyQuery.clone().sum<{ gwp: string }[]>('weekly_premium as gwp').first();
  const policyCountRow = await policyQuery.clone().count<{ count: string }[]>('id as count').first();

  const payoutQuery = db('payouts')
    .join('claims', 'payouts.claim_id', 'claims.id')
    .where('payouts.status', 'SUCCESS')
    .where('payouts.created_at', '>=', fromDate)
    .where('payouts.created_at', '<=', toDate);

  if (zoneId) {
    payoutQuery.whereIn('claims.worker_id', db('workers').select('id').where({ delivery_zone_id: zoneId }));
  }

  const paidRow = await payoutQuery.clone().sum<{ paid: string }[]>('payouts.amount as paid').first();
  const claimCountRow = await payoutQuery.clone().countDistinct<{ count: string }[]>('payouts.claim_id as count').first();

  const gwp = toNum(gwpRow?.gwp);
  const claimsPaid = toNum(paidRow?.paid);
  const lossRatio = gwp > 0 ? claimsPaid / gwp : 0;

  const result: LossRatio = {
    gross_written_premium: gwp,
    claims_paid: claimsPaid,
    loss_ratio: Number(lossRatio.toFixed(4)),
    claim_count: toNum(claimCountRow?.count),
    policy_count: toNum(policyCountRow?.count),
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
  };
  if (zoneId) result.zone_id = zoneId;
  return result;
}

/**
 * Unearned Premium Reserve — sum of the unearned portion of every active policy.
 * For each policy:  premium * (remaining_days / total_days), clamped to [0, premium].
 */
export async function getUPR(): Promise<{ upr: number; active_policies: number }> {
  const rows = await db('policies')
    .select('weekly_premium', 'coverage_period_start', 'coverage_period_end')
    .where({ status: 'ACTIVE' });

  const now = Date.now();
  let upr = 0;

  for (const row of rows) {
    const premium = toNum(row.weekly_premium);
    const start = new Date(row.coverage_period_start).getTime();
    const end = new Date(row.coverage_period_end).getTime();

    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const totalMs = end - start;
    const remainingMs = Math.max(0, Math.min(totalMs, end - now));
    upr += premium * (remainingMs / totalMs);
  }

  return { upr: Number(upr.toFixed(2)), active_policies: rows.length };
}

/**
 * Incurred But Not Reported — a back-of-envelope estimate. We take the
 * average monthly claim payout volume over the trailing 90 days and apply a
 * 15% uplift as an IBNR provision. This is the simplest defensible number
 * we can surface for an internal ops view.
 */
export async function getIBNR(): Promise<{
  estimated_ibnr: number;
  method: string;
  trailing_90_day_paid: number;
  monthly_avg: number;
}> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 3600 * 1000);
  const row = await db('payouts')
    .where('status', 'SUCCESS')
    .where('created_at', '>=', ninetyDaysAgo)
    .sum<{ paid: string }[]>('amount as paid')
    .first();

  const trailingPaid = toNum(row?.paid);
  const monthlyAvg = trailingPaid / 3;
  const ibnr = monthlyAvg * 0.15;

  return {
    estimated_ibnr: Number(ibnr.toFixed(2)),
    method: '15% of trailing 90-day avg',
    trailing_90_day_paid: Number(trailingPaid.toFixed(2)),
    monthly_avg: Number(monthlyAvg.toFixed(2)),
  };
}

export interface ZoneActuarial {
  zone_id: string;
  zone_name: string;
  gwp: number;
  claims_paid: number;
  loss_ratio: number;
  claim_count: number;
}

/**
 * Loss ratio per delivery zone over the last 90 days.
 */
export async function getByZone(): Promise<ZoneActuarial[]> {
  const since = new Date(Date.now() - 90 * 24 * 3600 * 1000);

  const rows = await db.raw(
    `
    WITH zone_gwp AS (
      SELECT w.delivery_zone_id AS zone_id,
             COALESCE(SUM(p.weekly_premium), 0) AS gwp,
             COUNT(p.id) AS policy_count
      FROM policies p
      JOIN workers w ON w.id = p.worker_id
      WHERE p.created_at >= ?
      GROUP BY w.delivery_zone_id
    ),
    zone_paid AS (
      SELECT w.delivery_zone_id AS zone_id,
             COALESCE(SUM(pay.amount), 0) AS paid,
             COUNT(DISTINCT pay.claim_id) AS claim_count
      FROM payouts pay
      JOIN claims c ON c.id = pay.claim_id
      JOIN workers w ON w.id = c.worker_id
      WHERE pay.status = 'SUCCESS' AND pay.created_at >= ?
      GROUP BY w.delivery_zone_id
    )
    SELECT dz.id AS zone_id,
           dz.name AS zone_name,
           COALESCE(g.gwp, 0) AS gwp,
           COALESCE(p.paid, 0) AS paid,
           COALESCE(p.claim_count, 0) AS claim_count
    FROM delivery_zones dz
    LEFT JOIN zone_gwp g ON g.zone_id = dz.id
    LEFT JOIN zone_paid p ON p.zone_id = dz.id
    ORDER BY dz.name ASC
    `,
    [since, since],
  );

  return rows.rows.map((r: { zone_id: string; zone_name: string; gwp: string; paid: string; claim_count: string }) => {
    const gwp = toNum(r.gwp);
    const paid = toNum(r.paid);
    return {
      zone_id: r.zone_id,
      zone_name: r.zone_name,
      gwp,
      claims_paid: paid,
      loss_ratio: gwp > 0 ? Number((paid / gwp).toFixed(4)) : 0,
      claim_count: toNum(r.claim_count),
    };
  });
}

export interface SolvencyMetrics {
  policies_in_force: number;
  total_sum_insured: number;
  ear_1in100: number;
  simulations: number;
}

/**
 * Simple Monte-Carlo Value-at-Risk estimate.
 *
 * Assumptions (clearly back-of-envelope):
 *   - each active policy has a 3% annual claim probability
 *   - claim severity ~ Uniform(500, 5000)
 *   - 1000 simulations, report the 99.5th-percentile aggregate loss
 */
export async function getSolvencyMetrics(): Promise<SolvencyMetrics> {
  const policies = await db('policies').where({ status: 'ACTIVE' }).select('weekly_premium');
  const n = policies.length;

  // "Total sum insured" proxy: annualise weekly premium * 20 (MVP-ish exposure factor).
  const totalSumInsured = policies.reduce((acc, p) => acc + toNum(p.weekly_premium) * 20, 0);

  const SIMS = 1000;
  const P_CLAIM = 0.03;
  const SEV_MIN = 500;
  const SEV_MAX = 5000;

  const losses: number[] = new Array(SIMS);
  for (let s = 0; s < SIMS; s++) {
    let loss = 0;
    for (let i = 0; i < n; i++) {
      if (Math.random() < P_CLAIM) {
        loss += SEV_MIN + Math.random() * (SEV_MAX - SEV_MIN);
      }
    }
    losses[s] = loss;
  }

  losses.sort((a, b) => a - b);
  const idx = Math.min(SIMS - 1, Math.floor(SIMS * 0.995));
  const ear = losses[idx] ?? 0;

  return {
    policies_in_force: n,
    total_sum_insured: Number(totalSumInsured.toFixed(2)),
    ear_1in100: Number(ear.toFixed(2)),
    simulations: SIMS,
  };
}
