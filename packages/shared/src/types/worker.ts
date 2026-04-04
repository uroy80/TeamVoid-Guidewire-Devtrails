export type Platform = 'blinkit' | 'zepto' | 'instamart';

export type RiskTier = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface Worker {
  id: string;
  name: string;
  mobile: string;
  aadhaar_hash: string | null;
  platform: Platform;
  dark_store_id: string;
  delivery_zone_id: string;
  avg_weekly_deliveries: number;
  avg_daily_earnings: number;
  avg_hours_per_day: number;
  hourly_rate: number;
  platform_rating: number;
  risk_score: number;
  risk_tier: RiskTier;
  is_verified: boolean;
  exclusions_acknowledged: boolean;
  payment_upi: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface WorkerProfile {
  rider_id: string;
  name: string;
  mobile: string;
  city: string;
  zone: string;
  store_id: string;
  totalDays: number;
  workDays: number;
  totalEarnings: number;
  totalDeliveries: number;
  avgDailyEarning: number;
  avgDeliveriesPerDay: number;
  totalHoursLost: number;
  totalHoursWorked: number;
  disruptionDays: number;
  disruptionRate: number;
  disruptionBreakdown: Record<string, number>;
  latestRating: number;
  monthsActive: number;
}

export interface RegisterWorkerInput {
  name: string;
  mobile: string;
  platform: Platform;
  delivery_zone_id: string;
  dark_store_id: string;
  avg_weekly_deliveries: number;
}
