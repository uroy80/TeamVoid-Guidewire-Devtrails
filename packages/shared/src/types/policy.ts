export type CoverageLevel = 'basic' | 'standard' | 'premium';

export type PolicyStatus = 'PENDING_PAYMENT' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED';

export interface Policy {
  id: string;
  policy_number: string;
  worker_id: string;
  coverage_level: CoverageLevel;
  coverage_period_start: Date;
  coverage_period_end: Date;
  weekly_premium: number;
  premium_breakdown: PremiumBreakdown;
  status: PolicyStatus;
  auto_renew: boolean;
  payment_transaction_ref: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PremiumBreakdown {
  basePremium: number;
  riskFactor: number;
  coverageMultiplier: number;
  loyaltyDiscount: boolean;
  finalPremium: number;
}

export interface PlanQuote {
  tier: CoverageLevel;
  premium: number;
  dailyPayout: number;
  maxDays: number;
  coveragePct: number;
  hourlyRate: number;
  avgHours: number;
  dailyIncome: number;
  riskScore: number;
  riskFactor: number;
  formula: {
    premium: string;
    payout: string;
  };
}

export interface CreatePolicyInput {
  coverage_level: CoverageLevel;
  payment_upi: string;
}
