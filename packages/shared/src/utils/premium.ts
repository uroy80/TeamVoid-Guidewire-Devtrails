import { CoverageLevel } from '../types/policy.js';
import { WorkerProfile, RiskTier } from '../types/worker.js';
import {
  COVERAGE_TIERS,
  RISK_TIER_RANGES,
  PREMIUM_MIN,
  PREMIUM_MAX,
  LOYALTY_RATING_THRESHOLD,
  LOYALTY_DISCOUNT,
} from '../constants/tiers.js';
import type { PlanQuote } from '../types/policy.js';

// Ported from prototype/api/insuranceEngine.js

export function computeHourlyRate(profile: WorkerProfile | null): number {
  if (!profile || !profile.totalHoursWorked || profile.totalHoursWorked === 0) return 100;
  return Math.round(profile.totalEarnings / profile.totalHoursWorked);
}

export function computeAvgHoursPerDay(profile: WorkerProfile | null): number {
  if (!profile || !profile.workDays || profile.workDays === 0) return 8;
  return Math.round((profile.totalHoursWorked / profile.workDays) * 10) / 10;
}

export function estimateDailyIncome(profile: WorkerProfile | null): number {
  return computeHourlyRate(profile) * computeAvgHoursPerDay(profile);
}

// Risk Score (0-100): 40% zone + 30% disruption rate + rating penalty + consistency penalty
export function computeRiskScore(profile: WorkerProfile | null, zoneRisk: number): number {
  let score = zoneRisk * 0.4;

  if (profile) {
    score += (profile.disruptionRate / 100) * 30;
    const ratingPenalty = Math.max(0, (4.5 - profile.latestRating) * 10);
    score += ratingPenalty;
    const consistency = profile.workDays / profile.totalDays;
    score += (1 - consistency) * 20;
  } else {
    score += 25; // unknown rider penalty
  }

  return Math.min(100, Math.max(0, Math.round(score)));
}

export function classifyRiskTier(riskScore: number): RiskTier {
  for (const [tier, range] of Object.entries(RISK_TIER_RANGES)) {
    if (riskScore >= range.min && riskScore <= range.max) {
      return tier as RiskTier;
    }
  }
  return 'CRITICAL';
}

// Maps 0-100 score to 0.5-2.5 multiplier
export function computeRiskFactor(riskScore: number): number {
  return 0.5 + (riskScore / 100) * 2.0;
}

// Premium = Base x Risk Factor x Coverage Multiplier, clamped 29-199
export function computePremium(
  tier: CoverageLevel,
  riskScore: number,
  profile: WorkerProfile | null
): number {
  const t = COVERAGE_TIERS[tier];
  const riskFactor = computeRiskFactor(riskScore);
  const coverageMultiplier = 0.6 + t.coveragePct * 0.8;

  let premium = Math.round(t.basePremium * riskFactor * coverageMultiplier);

  if (profile && profile.latestRating >= LOYALTY_RATING_THRESHOLD) {
    premium = Math.round(premium * (1 - LOYALTY_DISCOUNT));
  }

  return Math.max(PREMIUM_MIN, Math.min(PREMIUM_MAX, premium));
}

// Payout = Hours Lost x Hourly Rate x Coverage %
export function computePayout(hoursLost: number, hourlyRate: number, coveragePct: number): number {
  return Math.round(hoursLost * hourlyRate * coveragePct);
}

export function computeDailyPayout(profile: WorkerProfile | null, tier: CoverageLevel): number {
  const hourlyRate = computeHourlyRate(profile);
  const avgHours = computeAvgHoursPerDay(profile);
  const coveragePct = COVERAGE_TIERS[tier].coveragePct;
  return computePayout(avgHours, hourlyRate, coveragePct);
}

export function generatePlans(profile: WorkerProfile | null, zoneRisk: number): PlanQuote[] {
  const hourlyRate = computeHourlyRate(profile);
  const avgHours = computeAvgHoursPerDay(profile);
  const dailyIncome = Math.round(hourlyRate * avgHours);
  const riskScore = computeRiskScore(profile, zoneRisk);
  const riskFactor = computeRiskFactor(riskScore);

  return (['basic', 'standard', 'premium'] as CoverageLevel[]).map((tier) => {
    const t = COVERAGE_TIERS[tier];
    const premium = computePremium(tier, riskScore, profile);
    const dailyPayout = computeDailyPayout(profile, tier);

    return {
      tier,
      premium,
      dailyPayout,
      maxDays: t.maxDays,
      coveragePct: Math.round(t.coveragePct * 100),
      hourlyRate,
      avgHours,
      dailyIncome,
      riskScore,
      riskFactor: Math.round(riskFactor * 100) / 100,
      formula: {
        premium: `₹${t.basePremium} × ${Math.round(riskFactor * 100) / 100} × ${Math.round((0.6 + t.coveragePct * 0.8) * 100) / 100}`,
        payout: `${avgHours}hrs × ₹${hourlyRate}/hr × ${Math.round(t.coveragePct * 100)}%`,
      },
    };
  });
}
