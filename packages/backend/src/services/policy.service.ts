import { db } from '../config/database.js';
import {
  computePremium,
  computeRiskScore,
  computeRiskFactor,
  classifyRiskTier,
  COVERAGE_TIERS,
  LOYALTY_RATING_THRESHOLD,
  LOYALTY_DISCOUNT,
} from '@gigshield/shared';
import type { CoverageLevel, Policy, WorkerProfile } from '@gigshield/shared';
import { events } from './events.service.js';

function buildWorkerProfile(worker: Record<string, any>, zone: Record<string, any>): WorkerProfile {
  const totalDays = 30;
  const workDays = Math.round(totalDays * 0.73);
  const totalEarnings = Math.round(Number(worker.avg_daily_earnings) * workDays);
  const totalHoursWorked = Math.round(Number(worker.avg_hours_per_day) * workDays);
  const totalDeliveries = Math.round((worker.avg_weekly_deliveries / 7) * totalDays);
  const disruptionDays = Math.round(totalDays * 0.25);
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

function generatePolicyNumber(): string {
  const digits = Math.floor(100000 + Math.random() * 900000);
  return `GS-${digits}`;
}

function generateTransactionRef(): string {
  const chars = Math.floor(10000 + Math.random() * 90000);
  return `TXN-${chars}`;
}

export async function create(
  workerId: string,
  coverageLevel: CoverageLevel,
  paymentUpi: string
): Promise<Policy> {
  // Check for existing active policy
  const existing = await db('policies')
    .where({ worker_id: workerId, status: 'ACTIVE' })
    .first();

  if (existing) {
    throw new Error('Worker already has an active policy');
  }

  const worker = await db('workers').where({ id: workerId }).first();
  if (!worker) throw new Error('Worker not found');

  const zone = await db('delivery_zones').where({ id: worker.delivery_zone_id }).first();
  if (!zone) throw new Error('Delivery zone not found');

  const profile = buildWorkerProfile(worker, zone);
  const riskScore = computeRiskScore(profile, zone.base_risk);
  const riskFactor = computeRiskFactor(riskScore);
  const tierConfig = COVERAGE_TIERS[coverageLevel];
  const coverageMultiplier = 0.6 + tierConfig.coveragePct * 0.8;
  const premium = computePremium(coverageLevel, riskScore, profile);

  const premiumBreakdown = {
    basePremium: tierConfig.basePremium,
    riskFactor: Math.round(riskFactor * 100) / 100,
    coverageMultiplier: Math.round(coverageMultiplier * 100) / 100,
    loyaltyDiscount: profile.latestRating >= LOYALTY_RATING_THRESHOLD,
    finalPremium: premium,
  };

  const policyNumber = generatePolicyNumber();
  const transactionRef = generateTransactionRef();
  const now = new Date();
  const coverageEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // +7 days

  const [policy] = await db('policies')
    .insert({
      policy_number: policyNumber,
      worker_id: workerId,
      coverage_level: coverageLevel,
      coverage_period_start: now,
      coverage_period_end: coverageEnd,
      weekly_premium: premium,
      premium_breakdown: JSON.stringify(premiumBreakdown),
      status: 'ACTIVE',
      auto_renew: true,
      payment_transaction_ref: transactionRef,
    })
    .returning('*');

  // Update worker payment UPI
  await db('workers').where({ id: workerId }).update({
    payment_upi: paymentUpi,
    updated_at: db.fn.now(),
  });

  // Create financial ledger entry
  await db('financial_ledger').insert({
    worker_id: workerId,
    amount: premium,
    direction: 'INFLOW',
    type: 'PREMIUM_PAYMENT',
    reference_id: policy.id,
    transaction_ref: transactionRef,
  });

  // Create audit log entry
  await db('audit_log').insert({
    entity_type: 'POLICY',
    entity_id: policy.id,
    previous_state: null,
    new_state: JSON.stringify({
      status: 'ACTIVE',
      coverage_level: coverageLevel,
      premium,
    }),
    triggering_event: 'POLICY_CREATED',
    metadata: JSON.stringify({
      payment_upi: paymentUpi,
      transaction_ref: transactionRef,
    }),
  });

  try {
    events.emitEvent('POLICY_CREATED', {
      policy_id: policy.id,
      worker_id: workerId,
      coverage_level: policy.coverage_level,
      premium: policy.weekly_premium,
    });
  } catch {}

  return policy;
}

export async function getActive(workerId: string): Promise<Policy | null> {
  const policy = await db('policies')
    .where({ worker_id: workerId, status: 'ACTIVE' })
    .first();

  return policy ?? null;
}

export async function getHistory(workerId: string): Promise<Policy[]> {
  return db('policies')
    .where({ worker_id: workerId })
    .orderBy('created_at', 'desc');
}

export async function toggleAutoRenew(
  policyId: string,
  workerId: string
): Promise<Policy> {
  const policy = await db('policies')
    .where({ id: policyId, worker_id: workerId })
    .first();

  if (!policy) {
    throw new Error('Policy not found');
  }

  const [updated] = await db('policies')
    .where({ id: policyId })
    .update({
      auto_renew: !policy.auto_renew,
      updated_at: db.fn.now(),
    })
    .returning('*');

  // Audit log
  await db('audit_log').insert({
    entity_type: 'POLICY',
    entity_id: policyId,
    previous_state: JSON.stringify({ auto_renew: policy.auto_renew }),
    new_state: JSON.stringify({ auto_renew: updated.auto_renew }),
    triggering_event: 'AUTO_RENEW_TOGGLED',
    metadata: JSON.stringify({ worker_id: workerId }),
  });

  return updated;
}
