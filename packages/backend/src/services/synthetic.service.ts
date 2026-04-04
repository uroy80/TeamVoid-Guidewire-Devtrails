import type { Platform } from '@gigshield/shared';

/**
 * Disruption type weights by city.
 * Weights are out of 100 and represent relative probability.
 */
const CITY_DISRUPTION_WEIGHTS: Record<string, Record<string, number>> = {
  Mumbai: { heavy_rain: 40, flooding: 25, extreme_heat: 15, poor_aqi: 10, bandh: 10 },
  Delhi: { poor_aqi: 35, extreme_heat: 25, heavy_rain: 20, bandh: 15, flooding: 5 },
  Chennai: { heavy_rain: 35, extreme_heat: 25, flooding: 20, poor_aqi: 10, bandh: 10 },
  Kolkata: { flooding: 30, heavy_rain: 25, bandh: 20, extreme_heat: 15, poor_aqi: 10 },
  Bengaluru: { heavy_rain: 40, poor_aqi: 20, extreme_heat: 20, flooding: 10, bandh: 10 },
};

const DEFAULT_WEIGHTS: Record<string, number> = {
  heavy_rain: 30, extreme_heat: 25, poor_aqi: 20, flooding: 15, bandh: 10,
};

/** Platform average daily deliveries */
const PLATFORM_AVG_DELIVERIES: Record<Platform, number> = {
  blinkit: 20,
  zepto: 18,
  instamart: 16,
};

/**
 * Random integer in [min, max] inclusive.
 */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Random float in [min, max].
 */
function randFloat(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Weighted random selection from a weight map.
 */
function weightedRandom(weights: Record<string, number>): string {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = Math.random() * total;
  for (const [key, weight] of entries) {
    r -= weight;
    if (r <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

/**
 * Get disruption rate range based on zone risk.
 */
function getDisruptionRateRange(zoneRisk: number): [number, number] {
  if (zoneRisk <= 30) return [5, 8];
  if (zoneRisk <= 60) return [10, 18];
  return [20, 30];
}

export interface SyntheticProfile {
  totalDays: number;
  workDays: number;
  totalEarnings: number;
  totalDeliveries: number;
  avgDailyEarning: number;
  avgDeliveriesPerDay: number;
  totalHoursWorked: number;
  totalHoursLost: number;
  disruptionDays: number;
  disruptionRate: number;
  disruptionBreakdown: Record<string, number>;
  latestRating: number;
  monthsActive: number;
}

/**
 * Generate a synthetic 6-month delivery history for a new worker.
 * Returns a profile object compatible with WorkerProfile computations.
 */
export function generateSyntheticProfile(
  platform: Platform,
  city: string,
  zoneRisk: number,
): SyntheticProfile {
  const totalDays = 180;
  const platformAvg = PLATFORM_AVG_DELIVERIES[platform] || 18;
  const weights = CITY_DISRUPTION_WEIGHTS[city] || DEFAULT_WEIGHTS;
  const [minDisruptionPct, maxDisruptionPct] = getDisruptionRateRange(zoneRisk);
  const targetDisruptionRate = randFloat(minDisruptionPct, maxDisruptionPct);

  // Rating starts at 4.3, gradually improves to 4.5-4.9
  const finalRating = Math.round(randFloat(4.5, 4.9) * 10) / 10;

  let totalEarnings = 0;
  let totalDeliveries = 0;
  let totalHoursWorked = 0;
  let totalHoursLost = 0;
  let disruptionDays = 0;
  let workDays = 0;
  const disruptionBreakdown: Record<string, number> = {};

  for (let day = 0; day < totalDays; day++) {
    // ~85-95% of days are work days (some rest days)
    const isWorkDay = Math.random() < 0.92;
    if (!isWorkDay) continue;

    workDays++;

    // Check if this is a disruption day
    const isDisrupted = Math.random() * 100 < targetDisruptionRate;

    if (isDisrupted) {
      disruptionDays++;
      const disruptionType = weightedRandom(weights);
      disruptionBreakdown[disruptionType] = (disruptionBreakdown[disruptionType] || 0) + 1;

      // Disrupted days: reduced deliveries and hours lost
      const hoursLost = randFloat(2, 6);
      totalHoursLost += hoursLost;

      // Partial work on disruption days
      const partialDeliveries = randInt(4, Math.round(platformAvg * 0.5));
      const partialHours = randFloat(2, 5);
      const earningPerDelivery = randFloat(55, 80);

      totalDeliveries += partialDeliveries;
      totalHoursWorked += partialHours;
      totalEarnings += partialDeliveries * earningPerDelivery;
    } else {
      // Normal work day
      const dailyDeliveries = randInt(12, 28);
      // Bias toward platform average
      const adjustedDeliveries = Math.round((dailyDeliveries + platformAvg) / 2);
      const hoursWorked = randFloat(7, 11);
      const earningPerDelivery = randFloat(55, 80);

      totalDeliveries += adjustedDeliveries;
      totalHoursWorked += hoursWorked;
      totalEarnings += adjustedDeliveries * earningPerDelivery;
    }
  }

  // Round all values
  totalEarnings = Math.round(totalEarnings);
  totalHoursWorked = Math.round(totalHoursWorked * 10) / 10;
  totalHoursLost = Math.round(totalHoursLost * 10) / 10;

  const avgDailyEarning = workDays > 0 ? Math.round(totalEarnings / workDays) : 0;
  const avgDeliveriesPerDay = workDays > 0 ? Math.round((totalDeliveries / workDays) * 10) / 10 : 0;
  const disruptionRate = workDays > 0 ? Math.round((disruptionDays / workDays) * 10000) / 100 : 0;

  return {
    totalDays,
    workDays,
    totalEarnings,
    totalDeliveries,
    avgDailyEarning,
    avgDeliveriesPerDay,
    totalHoursWorked,
    totalHoursLost,
    disruptionDays,
    disruptionRate,
    disruptionBreakdown,
    latestRating: finalRating,
    monthsActive: 6,
  };
}
