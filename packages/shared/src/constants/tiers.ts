import { CoverageLevel } from '../types/policy.js';
import { RiskTier } from '../types/worker.js';

export interface TierConfig {
  coveragePct: number;
  basePremium: number;
  maxDays: number;
}

export const COVERAGE_TIERS: Record<CoverageLevel, TierConfig> = {
  basic: { coveragePct: 0.50, basePremium: 20, maxDays: 3 },
  standard: { coveragePct: 0.75, basePremium: 35, maxDays: 5 },
  premium: { coveragePct: 1.00, basePremium: 50, maxDays: 7 },
};

export const RISK_TIER_RANGES: Record<RiskTier, { min: number; max: number }> = {
  LOW: { min: 0, max: 25 },
  MEDIUM: { min: 26, max: 50 },
  HIGH: { min: 51, max: 75 },
  CRITICAL: { min: 76, max: 100 },
};

export const PREMIUM_MIN = 29;
export const PREMIUM_MAX = 199;
export const LOYALTY_RATING_THRESHOLD = 4.7;
export const LOYALTY_DISCOUNT = 0.10;
