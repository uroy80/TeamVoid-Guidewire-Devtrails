import { db } from '../config/database.js';
import {
  computeRiskScore,
  classifyRiskTier,
  generatePlans,
} from '@gigshield/shared';
import type { WorkerProfile, RiskTier, PlanQuote } from '@gigshield/shared';

function buildWorkerProfile(worker: Record<string, any>, zone: Record<string, any>): WorkerProfile {
  const totalDays = 30; // rolling 30-day window
  const workDays = worker.avg_hours_per_day > 0
    ? Math.round(totalDays * 0.73) // ~22 days of 30
    : 0;
  const totalEarnings = Math.round(worker.avg_daily_earnings * workDays);
  const totalHoursWorked = Math.round(Number(worker.avg_hours_per_day) * workDays);
  const totalDeliveries = Math.round((worker.avg_weekly_deliveries / 7) * totalDays);
  const disruptionDays = Math.round(totalDays * 0.25); // estimate from historical
  const disruptionRate = Math.round((disruptionDays / totalDays) * 100);

  return {
    rider_id: worker.id,
    name: worker.name,
    mobile: worker.mobile,
    city: zone.city,
    zone: zone.name,
    store_id: worker.dark_store_id ?? '',
    totalDays,
    workDays,
    totalEarnings,
    totalDeliveries,
    avgDailyEarning: workDays > 0 ? Math.round(totalEarnings / workDays) : 0,
    avgDeliveriesPerDay: workDays > 0 ? Math.round(totalDeliveries / workDays) : 0,
    totalHoursLost: Math.round(disruptionDays * Number(worker.avg_hours_per_day)),
    totalHoursWorked,
    disruptionDays,
    disruptionRate,
    disruptionBreakdown: {},
    latestRating: Number(worker.platform_rating),
    monthsActive: 6,
  };
}

export async function computeWorkerRisk(
  workerId: string
): Promise<{ riskScore: number; riskTier: RiskTier }> {
  const worker = await db('workers').where({ id: workerId }).first();
  if (!worker) throw new Error('Worker not found');

  const zone = await db('delivery_zones').where({ id: worker.delivery_zone_id }).first();
  if (!zone) throw new Error('Delivery zone not found');

  const profile = buildWorkerProfile(worker, zone);
  const riskScore = computeRiskScore(profile, zone.base_risk);
  const riskTier = classifyRiskTier(riskScore);

  await db('workers').where({ id: workerId }).update({
    risk_score: riskScore,
    risk_tier: riskTier,
    updated_at: db.fn.now(),
  });

  return { riskScore, riskTier };
}

export async function getPlans(workerId: string): Promise<PlanQuote[]> {
  const worker = await db('workers').where({ id: workerId }).first();
  if (!worker) throw new Error('Worker not found');

  const zone = await db('delivery_zones').where({ id: worker.delivery_zone_id }).first();
  if (!zone) throw new Error('Delivery zone not found');

  const profile = buildWorkerProfile(worker, zone);
  return generatePlans(profile, zone.base_risk);
}
