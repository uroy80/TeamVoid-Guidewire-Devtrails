import { db } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { computeRiskScore, classifyRiskTier, computeHourlyRate, computeAvgHoursPerDay } from '@gigshield/shared';
import type { Worker, Platform } from '@gigshield/shared';
import { generateSyntheticProfile } from './synthetic.service.js';
import { events } from './events.service.js';

/**
 * Input for the new registration flow.
 * Accepts lat/lng for location-based store assignment.
 */
export interface NewRegisterInput {
  name: string;
  mobile: string;
  platform: Platform;
  latitude: number;
  longitude: number;
  dark_store_id?: string; // optional — if not provided, find nearest store
}

/**
 * Haversine distance helper (km).
 */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Find the nearest delivery zone that isn't "Unknown", by lat/lng.
 * If no zone is within 10km, create a new one via reverse geocoding.
 */
async function findNearestRealZone(lat: number, lng: number) {
  const zones = await db('delivery_zones')
    .whereNot('city', 'Unknown')
    .where('latitude', '!=', 0);

  let nearest = zones[0];
  let minDist = Infinity;
  for (const z of zones) {
    const dist = haversineKm(lat, lng, Number(z.latitude), Number(z.longitude));
    if (dist < minDist) {
      minDist = dist;
      nearest = z;
    }
  }

  // If nearest zone is > 10km away, create a new zone at this location
  if (minDist > 10) {
    try {
      const rgRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=14&addressdetails=1`,
        { headers: { 'User-Agent': 'GigShield/1.0' } }
      );
      const rgData = await rgRes.json() as any;
      const addr = rgData.address || {};
      const locality = addr.suburb || addr.neighbourhood || addr.village || addr.city_district || addr.town || 'Local Zone';
      const city = addr.city || addr.town || addr.state_district || addr.county || nearest?.city || 'India';
      const state = addr.state || nearest?.state || '';
      const zoneName = locality;
      const pinCode = addr.postcode || '000000';

      // Check if we already created this zone
      const existing = await db('delivery_zones')
        .where({ city, name: zoneName })
        .first();

      if (existing) return existing;

      const [newZone] = await db('delivery_zones').insert({
        pin_code: pinCode,
        name: zoneName,
        city,
        state,
        latitude: lat,
        longitude: lng,
        base_risk: nearest?.base_risk || 40,
      }).returning('*');

      console.log(`[Zone] Created new zone: ${zoneName}, ${city} (${lat}, ${lng}) — nearest was ${minDist.toFixed(1)}km away`);
      return newZone;
    } catch (err) {
      console.error('[Zone] Failed to create dynamic zone:', err);
      return nearest; // fallback to nearest existing
    }
  }

  return nearest;
}

/**
 * Register a new worker.
 * Creates the worker record, generates a synthetic 6-month profile,
 * computes risk score, hourly rate, and other derived fields.
 */
export async function register(input: NewRegisterInput): Promise<Worker> {
  // Check if mobile already registered
  const existing = await db('workers').where({ mobile: input.mobile }).first();
  if (existing) {
    throw new AppError('A worker with this mobile number already exists', 409);
  }

  let darkStoreId = input.dark_store_id;
  let deliveryZoneId: string;
  let zoneRisk: number;
  let city: string;

  if (darkStoreId) {
    // Validate the provided dark store
    const store = await db('dark_stores')
      .select('dark_stores.*', 'delivery_zones.base_risk', 'delivery_zones.city as zone_city')
      .leftJoin('delivery_zones', 'dark_stores.delivery_zone_id', 'delivery_zones.id')
      .where('dark_stores.id', darkStoreId)
      .first();

    if (!store) {
      throw new AppError('Invalid dark store ID', 400);
    }

    // If store's zone is "Unknown", find the nearest real zone by coordinates
    if (store.zone_city === 'Unknown' || !store.zone_city) {
      const nearestZone = await findNearestRealZone(Number(store.latitude), Number(store.longitude));
      deliveryZoneId = nearestZone.id;
      zoneRisk = nearestZone.base_risk ?? 50;
      city = nearestZone.city || 'Unknown';
    } else {
      deliveryZoneId = store.delivery_zone_id;
      zoneRisk = store.base_risk ?? 50;
      city = store.city || store.zone_city || 'Unknown';
    }
  } else {
    // Find nearest store for the worker's platform using lat/lng
    const degBuffer = 10 / 111; // ~10km bounding box
    const stores = await db('dark_stores')
      .select('dark_stores.*', 'delivery_zones.base_risk', 'delivery_zones.city as zone_city')
      .leftJoin('delivery_zones', 'dark_stores.delivery_zone_id', 'delivery_zones.id')
      .where('dark_stores.platform', input.platform)
      .whereBetween('dark_stores.latitude', [input.latitude - degBuffer, input.latitude + degBuffer])
      .whereBetween('dark_stores.longitude', [input.longitude - degBuffer, input.longitude + degBuffer]);

    if (stores.length === 0) {
      // Expand search to any store for this platform
      const anyStore = await db('dark_stores')
        .select('dark_stores.*', 'delivery_zones.base_risk', 'delivery_zones.city as zone_city')
        .leftJoin('delivery_zones', 'dark_stores.delivery_zone_id', 'delivery_zones.id')
        .where('dark_stores.platform', input.platform)
        .first();

      if (!anyStore) {
        throw new AppError(`No stores found for platform ${input.platform}`, 400);
      }

      darkStoreId = anyStore.id;
      const nearestZone = await findNearestRealZone(Number(anyStore.latitude), Number(anyStore.longitude));
      deliveryZoneId = nearestZone.id;
      zoneRisk = nearestZone.base_risk ?? 50;
      city = nearestZone.city || 'Unknown';
    } else {
      // Pick the closest one
      let minDist = Infinity;
      let closest = stores[0];
      for (const s of stores) {
        const dist = haversineKm(input.latitude, input.longitude, Number(s.latitude), Number(s.longitude));
        if (dist < minDist) {
          minDist = dist;
          closest = s;
        }
      }
      darkStoreId = closest.id;
      // If zone is Unknown, find nearest real zone
      if (closest.zone_city === 'Unknown' || !closest.zone_city) {
        const nearestZone = await findNearestRealZone(Number(closest.latitude), Number(closest.longitude));
        deliveryZoneId = nearestZone.id;
        zoneRisk = nearestZone.base_risk ?? 50;
        city = nearestZone.city || 'Unknown';
      } else {
        deliveryZoneId = closest.delivery_zone_id;
        zoneRisk = closest.base_risk ?? 50;
        city = closest.city || closest.zone_city || 'Unknown';
      }
    }
  }

  // Generate synthetic 6-month profile
  const syntheticProfile = generateSyntheticProfile(input.platform, city, zoneRisk);

  // Build a WorkerProfile-compatible object for risk computation
  const profileForRisk = {
    rider_id: '',
    name: input.name,
    mobile: input.mobile,
    city,
    zone: '',
    store_id: darkStoreId!,
    ...syntheticProfile,
  };

  // Compute risk score using synthetic profile + zone risk
  const riskScore = computeRiskScore(profileForRisk, zoneRisk);
  const riskTier = classifyRiskTier(riskScore);

  // Compute derived fields from synthetic profile
  const hourlyRate = computeHourlyRate(profileForRisk);
  const avgHoursPerDay = computeAvgHoursPerDay(profileForRisk);
  const avgDailyEarnings = syntheticProfile.avgDailyEarning;
  const platformRating = syntheticProfile.latestRating;
  const avgWeeklyDeliveries = Math.round(syntheticProfile.avgDeliveriesPerDay * 7);

  const [worker] = await db('workers')
    .insert({
      name: input.name,
      mobile: input.mobile,
      platform: input.platform,
      delivery_zone_id: deliveryZoneId,
      dark_store_id: darkStoreId,
      avg_weekly_deliveries: avgWeeklyDeliveries,
      hourly_rate: hourlyRate,
      avg_daily_earnings: avgDailyEarnings,
      avg_hours_per_day: avgHoursPerDay,
      platform_rating: platformRating,
      risk_score: riskScore,
      risk_tier: riskTier,
    })
    .returning('*');

  try {
    events.emitEvent('WORKER_REGISTERED', {
      worker_id: worker.id,
      name: worker.name,
      platform: worker.platform,
      zone_id: worker.delivery_zone_id,
    });
  } catch {}

  return worker as Worker;
}

/**
 * Get a worker by UUID.
 */
export async function getById(id: string): Promise<Worker> {
  const worker = await db('workers').where({ id }).first();
  if (!worker) {
    throw new AppError('Worker not found', 404);
  }
  return worker as Worker;
}

/**
 * Get a worker by mobile number.
 */
export async function getByMobile(mobile: string): Promise<Worker | null> {
  const worker = await db('workers').where({ mobile }).first();
  return (worker as Worker) ?? null;
}

/**
 * Set exclusions_acknowledged to true for a worker.
 */
export async function acknowledgeExclusions(workerId: string): Promise<Worker> {
  const [updated] = await db('workers')
    .where({ id: workerId })
    .update({ exclusions_acknowledged: true, updated_at: new Date() })
    .returning('*');

  if (!updated) {
    throw new AppError('Worker not found', 404);
  }

  return updated as Worker;
}

/**
 * Record a GPS location ping and upsert the device fingerprint.
 */
export async function updateLocation(
  workerId: string,
  latitude: number,
  longitude: number,
  accuracy: number,
  source: 'GPS' | 'NETWORK' | 'IP',
  deviceFingerprint?: string,
  ipAddress?: string
): Promise<void> {
  // Verify worker exists
  const worker = await db('workers').where({ id: workerId }).first();
  if (!worker) {
    throw new AppError('Worker not found', 404);
  }

  // Insert location log entry with IP address
  await db('worker_location_log').insert({
    worker_id: workerId,
    latitude,
    longitude,
    accuracy_meters: accuracy,
    source,
    device_fingerprint: deviceFingerprint ?? null,
    ip_address: ipAddress ?? null,
    recorded_at: new Date(),
  });

  // Upsert device fingerprint if provided
  if (deviceFingerprint) {
    const existingFp = await db('device_fingerprints')
      .where({ worker_id: workerId, fingerprint_hash: deviceFingerprint })
      .first();

    if (existingFp) {
      await db('device_fingerprints')
        .where({ id: existingFp.id })
        .update({ last_seen_at: new Date() });
    } else {
      await db('device_fingerprints').insert({
        worker_id: workerId,
        fingerprint_hash: deviceFingerprint,
        first_seen_at: new Date(),
        last_seen_at: new Date(),
      });
    }
  }
}
