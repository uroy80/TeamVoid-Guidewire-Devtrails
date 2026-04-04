export type DisruptionType =
  | 'EXTREME_HEAT'
  | 'HEAVY_RAINFALL'
  | 'FLOODING'
  | 'SEVERE_POLLUTION'
  | 'SOCIAL_DISRUPTION';

export type Severity = 'MODERATE' | 'SEVERE' | 'EXTREME';

export type ClaimStatus =
  | 'CREATED'
  | 'VALIDATING'
  | 'APPROVED'
  | 'UNDER_REVIEW'
  | 'REJECTED'
  | 'PAID';

export interface DisruptionEvent {
  id: string;
  event_type: DisruptionType;
  severity: Severity;
  delivery_zone_id: string;
  affected_dark_store_ids: string[];
  duration_estimate_hours: number;
  source_data: Record<string, unknown>;
  verified_by_sources: string[];
  event_timestamp: Date;
  created_at: Date;
}

export interface Claim {
  id: string;
  claim_number: string;
  policy_id: string;
  worker_id: string;
  disruption_event_id: string;
  status: ClaimStatus;
  disruption_hours: number;
  estimated_hourly_earnings: number;
  coverage_level_pct: number;
  income_loss_payout: number;
  fraud_score: number;
  fraud_check_details: FraudCheckDetails | null;
  rejection_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface FraudCheckDetails {
  bas_score: number;
  gps_authenticity: number;
  movement_entropy: number;
  device_consistency: number;
  historical_behavior: number;
  ring_fraud_absence: number;
  weather_correlation: number;
  flags: string[];
  tier: 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';
  bas_breakdown?: import('./fraud').BASBreakdown;
}
