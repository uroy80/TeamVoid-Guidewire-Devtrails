import type { Knex } from 'knex';
import { computeRiskScore, classifyRiskTier } from '@gigshield/shared';
import type { WorkerProfile } from '@gigshield/shared';

interface CSVRecord {
  rider_id: string;
  name: string;
  mobile: string;
  aadhaar: string;
  city: string;
  zone: string;
  store_id: string;
  date: string;
  deliveries: number;
  earnings_inr: number;
  hours_worked: number;
  disruption_type: string;
  disruption_hours_lost: number;
  platform_rating: number;
}

// Hardcoded rider data from the 3 CSV files (aggregated)
// Ported from prototype CSV files using mockApi.js computeRiderProfile logic
const riderAggregates = [
  {
    rider_id: 'BLK-R001', name: 'Usham Roy', mobile: '7001989183',
    aadhaar: '876543217744', city: 'Kolkata', zone: 'Salt Lake',
    store_code: 'BLK-SLK-01', platform: 'blinkit' as const,
    totalDays: 30, workDays: 22, totalEarnings: 28390,
    totalDeliveries: 434, totalHoursWorked: 207, totalHoursLost: 81,
    disruptionDays: 8, latestRating: 4.9,
  },
  {
    rider_id: 'ZPT-R001', name: 'Palash Rai', mobile: '8960247508',
    aadhaar: '765432108833', city: 'Mumbai', zone: 'Powai',
    store_code: 'ZPT-POW-01', platform: 'zepto' as const,
    totalDays: 30, workDays: 22, totalEarnings: 26180,
    totalDeliveries: 402, totalHoursWorked: 195, totalHoursLost: 71,
    disruptionDays: 8, latestRating: 4.6,
  },
  {
    rider_id: 'IM-R001', name: 'Venumadhav S', mobile: '7824896226',
    aadhaar: '654321097722', city: 'Chennai', zone: 'T. Nagar',
    store_code: 'IM-TNG-01', platform: 'instamart' as const,
    totalDays: 30, workDays: 22, totalEarnings: 27440,
    totalDeliveries: 420, totalHoursWorked: 201, totalHoursLost: 68,
    disruptionDays: 7, latestRating: 4.5,
  },
];

export async function seed(knex: Knex): Promise<void> {
  for (const rider of riderAggregates) {
    // Find zone and store IDs
    const zone = await knex('delivery_zones')
      .where({ city: rider.city, name: rider.zone })
      .first();

    const store = await knex('dark_stores')
      .where({ store_code: rider.store_code })
      .first();

    if (!zone || !store) {
      console.warn(`Zone/store not found for ${rider.name}, skipping`);
      continue;
    }

    const hourlyRate = rider.totalHoursWorked > 0
      ? Math.round(rider.totalEarnings / rider.totalHoursWorked)
      : 100;

    const avgHoursPerDay = rider.workDays > 0
      ? Math.round((rider.totalHoursWorked / rider.workDays) * 10) / 10
      : 8;

    const disruptionRate = Math.round((rider.disruptionDays / rider.totalDays) * 100);

    const profile: WorkerProfile = {
      rider_id: rider.rider_id,
      name: rider.name,
      mobile: rider.mobile,
      city: rider.city,
      zone: rider.zone,
      store_id: rider.store_code,
      totalDays: rider.totalDays,
      workDays: rider.workDays,
      totalEarnings: rider.totalEarnings,
      totalDeliveries: rider.totalDeliveries,
      avgDailyEarning: rider.workDays > 0 ? Math.round(rider.totalEarnings / rider.workDays) : 0,
      avgDeliveriesPerDay: rider.workDays > 0 ? Math.round(rider.totalDeliveries / rider.workDays) : 0,
      totalHoursLost: rider.totalHoursLost,
      totalHoursWorked: rider.totalHoursWorked,
      disruptionDays: rider.disruptionDays,
      disruptionRate,
      disruptionBreakdown: {},
      latestRating: rider.latestRating,
      monthsActive: 6,
    };

    const riskScore = computeRiskScore(profile, zone.base_risk);
    const riskTier = classifyRiskTier(riskScore);

    await knex('workers').insert({
      name: rider.name,
      mobile: rider.mobile,
      aadhaar_hash: rider.aadhaar, // In production, this would be hashed
      platform: rider.platform,
      dark_store_id: store.id,
      delivery_zone_id: zone.id,
      avg_weekly_deliveries: rider.workDays > 0 ? Math.round((rider.totalDeliveries / rider.totalDays) * 7) : 0,
      avg_daily_earnings: rider.workDays > 0 ? Math.round(rider.totalEarnings / rider.workDays) : 0,
      avg_hours_per_day: avgHoursPerDay,
      hourly_rate: hourlyRate,
      platform_rating: rider.latestRating,
      risk_score: riskScore,
      risk_tier: riskTier,
      is_verified: true,
      exclusions_acknowledged: true,
      payment_upi: `${rider.mobile}@upi`,
    });

    console.log(`Seeded worker: ${rider.name} (${rider.platform}) - Risk: ${riskScore} (${riskTier})`);
  }
}
