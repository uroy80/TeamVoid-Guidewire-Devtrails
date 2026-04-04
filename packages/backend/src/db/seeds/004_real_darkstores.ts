import type { Knex } from 'knex';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// ── Types for source JSON ────────────────────────────────────────────
interface ZeptoStore {
  id: string;
  name: string;
  lat: number;
  lng: number;
  city: string;
  state: string;
  zone: number[][];
}

interface BlinkitStore {
  id: number;
  accuracy: number;
  coordinates: [number, number]; // [lat, lng]
}

interface SwiggyStore {
  id: string;
  locality: string;
  coordinates: [number, number]; // [lat, lng]
}

// ── City risk mapping ────────────────────────────────────────────────
const CITY_BASE_RISK: Record<string, number> = {
  Mumbai: 65,
  Chennai: 55,
  Kolkata: 60,
  Delhi: 70,
  Bengaluru: 45,
  Hyderabad: 50,
  Pune: 40,
  Gurugram: 65,
  Noida: 60,
  Ghaziabad: 60,
  Faridabad: 60,
  Jaipur: 45,
  Ahmedabad: 45,
  Lucknow: 50,
  Chandigarh: 40,
  Indore: 45,
  Surat: 45,
  Kochi: 50,
  Coimbatore: 40,
};

// ── Reverse geocode approximation for Blinkit (no city field) ────────
// Maps lat/lng ranges to city names for major Indian metros
function approximateCity(lat: number, lng: number): string {
  if (lat >= 18.85 && lat <= 19.45 && lng >= 72.75 && lng <= 73.10) return 'Mumbai';
  if (lat >= 28.40 && lat <= 28.90 && lng >= 76.85 && lng <= 77.50) return 'Delhi';
  if (lat >= 12.75 && lat <= 13.20 && lng >= 77.40 && lng <= 77.80) return 'Bengaluru';
  if (lat >= 17.20 && lat <= 17.60 && lng >= 78.30 && lng <= 78.65) return 'Hyderabad';
  if (lat >= 12.80 && lat <= 13.25 && lng >= 80.05 && lng <= 80.35) return 'Chennai';
  if (lat >= 22.40 && lat <= 22.70 && lng >= 88.20 && lng <= 88.55) return 'Kolkata';
  if (lat >= 18.40 && lat <= 18.70 && lng >= 73.70 && lng <= 74.00) return 'Pune';
  if (lat >= 26.80 && lat <= 27.05 && lng >= 75.65 && lng <= 75.95) return 'Jaipur';
  if (lat >= 22.95 && lat <= 23.15 && lng >= 72.45 && lng <= 72.75) return 'Ahmedabad';
  if (lat >= 26.75 && lat <= 27.00 && lng >= 80.85 && lng <= 81.10) return 'Lucknow';
  if (lat >= 28.55 && lat <= 28.85 && lng >= 76.95 && lng <= 77.15) return 'Gurugram';
  if (lat >= 28.50 && lat <= 28.70 && lng >= 77.25 && lng <= 77.55) return 'Noida';
  if (lat >= 28.55 && lat <= 28.75 && lng >= 77.35 && lng <= 77.55) return 'Ghaziabad';
  if (lat >= 28.35 && lat <= 28.55 && lng >= 77.25 && lng <= 77.45) return 'Faridabad';
  if (lat >= 21.10 && lat <= 21.30 && lng >= 72.75 && lng <= 73.00) return 'Surat';
  if (lat >= 22.60 && lat <= 22.85 && lng >= 75.75 && lng <= 76.00) return 'Indore';
  if (lat >= 30.65 && lat <= 30.85 && lng >= 76.65 && lng <= 76.90) return 'Chandigarh';
  if (lat >= 9.90 && lat <= 10.10 && lng >= 76.20 && lng <= 76.45) return 'Kochi';
  if (lat >= 10.95 && lat <= 11.10 && lng >= 76.90 && lng <= 77.10) return 'Coimbatore';
  if (lat >= 21.05 && lat <= 21.25 && lng >= 79.00 && lng <= 79.20) return 'Nagpur';
  return 'Unknown';
}

// ── Batch insert helper ──────────────────────────────────────────────
async function batchInsert(
  knex: Knex,
  table: string,
  rows: Record<string, unknown>[],
  chunkSize = 100,
): Promise<void> {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    await knex.raw(
      knex(table).insert(chunk).toQuery() + ' ON CONFLICT (store_code) DO NOTHING',
    );
  }
}

// ── Main seed ────────────────────────────────────────────────────────
export async function seed(knex: Knex): Promise<void> {
  // Load JSON data
  const zeptoStores: ZeptoStore[] = require('./zepto.json');
  const blinkitStores: BlinkitStore[] = require('./blinkit.json');
  const swiggyStores: SwiggyStore[] = require('./swiggy.json');

  console.log(
    `[Seed 004] Loading ${zeptoStores.length} Zepto, ${blinkitStores.length} Blinkit, ${swiggyStores.length} Swiggy stores`,
  );

  // ── Step 1: Collect all unique cities ────────────────────────────
  const citySet = new Set<string>();

  for (const s of zeptoStores) {
    if (s.city) citySet.add(s.city);
  }
  for (const s of blinkitStores) {
    const city = approximateCity(s.coordinates[0], s.coordinates[1]);
    citySet.add(city);
  }
  // Swiggy stores have locality but no city — group under "Unknown"
  citySet.add('Unknown');

  // ── Step 2: Ensure delivery_zones exist for each city ────────────
  // Fetch existing zones
  const existingZones = await knex('delivery_zones').select('id', 'city', 'name');
  const zoneMap = new Map<string, string>(); // city -> zone id

  for (const z of existingZones) {
    // Use first zone found for each city
    if (!zoneMap.has(z.city)) {
      zoneMap.set(z.city, z.id);
    }
  }

  // Create zones for cities that don't have one yet
  for (const city of citySet) {
    if (!zoneMap.has(city)) {
      const baseRisk = CITY_BASE_RISK[city] ?? 50;
      const [row] = await knex('delivery_zones')
        .insert({
          pin_code: '000000',
          name: `${city} Central`,
          city,
          state: '',
          latitude: 0,
          longitude: 0,
          base_risk: baseRisk,
        })
        .returning('id');
      zoneMap.set(city, row.id);
    }
  }

  // ── Step 3: Prepare dark store rows ──────────────────────────────
  const storeRows: Record<string, unknown>[] = [];

  // Zepto stores
  for (const s of zeptoStores) {
    const zoneId = zoneMap.get(s.city) ?? zoneMap.get('Unknown')!;
    storeRows.push({
      store_code: `ZPT-${s.id}`.substring(0, 50),
      name: (s.name || `Zepto Store ${s.city}`).substring(0, 100),
      delivery_zone_id: zoneId,
      platform: 'zepto',
      latitude: s.lat,
      longitude: s.lng,
      city: s.city || null,
      state: s.state || null,
      locality: null,
      accuracy_meters: null,
      source_platform: 'zepto',
    });
  }

  // Blinkit stores
  for (const s of blinkitStores) {
    const lat = s.coordinates[0];
    const lng = s.coordinates[1];
    const city = approximateCity(lat, lng);
    const zoneId = zoneMap.get(city) ?? zoneMap.get('Unknown')!;
    storeRows.push({
      store_code: `BLK-${s.id}`.substring(0, 50),
      name: `Blinkit Store #${s.id}`.substring(0, 100),
      delivery_zone_id: zoneId,
      platform: 'blinkit',
      latitude: lat,
      longitude: lng,
      city: city !== 'Unknown' ? city : null,
      state: null,
      locality: null,
      accuracy_meters: s.accuracy ?? null,
      source_platform: 'blinkit',
    });
  }

  // Swiggy / Instamart stores — assign to nearest real zone by coordinates
  // (these stores have no city data, so we can't match by city name)
  const realZones = await knex('delivery_zones')
    .whereNot('city', 'Unknown')
    .where('latitude', '!=', 0)
    .select('id', 'latitude', 'longitude');

  function findNearestZoneId(lat: number, lng: number): string {
    let nearestId = realZones[0]?.id;
    let minDist = Infinity;
    for (const z of realZones) {
      const dLat = Number(z.latitude) - lat;
      const dLng = Number(z.longitude) - lng;
      const dist = dLat * dLat + dLng * dLng; // squared distance, no need for sqrt
      if (dist < minDist) {
        minDist = dist;
        nearestId = z.id;
      }
    }
    return nearestId;
  }

  for (const s of swiggyStores) {
    const lat = s.coordinates[0];
    const lng = s.coordinates[1];
    const zoneId = findNearestZoneId(lat, lng);
    storeRows.push({
      store_code: `IM-${s.id}`.substring(0, 50),
      name: `Instamart ${s.locality || s.id}`.substring(0, 100),
      delivery_zone_id: zoneId,
      platform: 'instamart',
      latitude: lat,
      longitude: lng,
      city: null,
      state: null,
      locality: s.locality || null,
      accuracy_meters: null,
      source_platform: 'instamart',
    });
  }

  // ── Step 4: Batch insert ─────────────────────────────────────────
  console.log(`[Seed 004] Inserting ${storeRows.length} dark stores in batches of 100...`);
  await batchInsert(knex, 'dark_stores', storeRows, 100);

  const totalStores = await knex('dark_stores').count('* as count').first();
  console.log(`[Seed 004] Done. Total dark stores in DB: ${totalStores?.count}`);
}
