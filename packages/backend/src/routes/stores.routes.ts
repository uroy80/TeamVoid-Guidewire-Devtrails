import { Router, Request, Response } from 'express';
import { db } from '../config/database.js';

const router = Router();

/**
 * Haversine distance in kilometres between two lat/lng points.
 */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth radius in km
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * GET /nearby?lat=...&lng=...&radius=5
 * Find dark stores within radius (default 5 km).
 * Returns stores grouped by platform, sorted by distance.
 */
router.get('/nearby', async (req: Request, res: Response) => {
  try {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);
    const radiusKm = parseFloat(req.query.radius as string) || 5;

    if (isNaN(lat) || isNaN(lng)) {
      res.status(400).json({ error: 'lat and lng query parameters are required' });
      return;
    }

    // Rough bounding box filter first (for performance), then precise haversine in JS
    const degBuffer = radiusKm / 111; // ~111 km per degree latitude
    const stores = await db('dark_stores')
      .select(
        'dark_stores.*',
        'delivery_zones.name as zone_name',
        'delivery_zones.city as zone_city',
        'delivery_zones.base_risk',
      )
      .leftJoin('delivery_zones', 'dark_stores.delivery_zone_id', 'delivery_zones.id')
      .whereBetween('dark_stores.latitude', [lat - degBuffer, lat + degBuffer])
      .whereBetween('dark_stores.longitude', [lng - degBuffer, lng + degBuffer]);

    // Calculate distance, fix display names, and filter by exact radius
    const results = stores
      .map((s: any) => {
        const platformLabel = s.platform === 'blinkit' ? 'Blinkit' : s.platform === 'zepto' ? 'Zepto' : s.platform === 'instamart' ? 'Instamart' : s.platform;
        const locality = (s.locality && s.locality !== 'Unknown Central') ? s.locality : null;
        const city = (s.city && s.city !== 'Unknown') ? s.city : ((s.zone_city && s.zone_city !== 'Unknown') ? s.zone_city : null);

        let displayName = s.name;
        if (/Unknown|Store\s*#\d+/i.test(displayName) || !displayName) {
          displayName = locality ? `${platformLabel} — ${locality}` : city ? `${platformLabel} — ${city}` : `${platformLabel} Store`;
        }

        return {
          ...s,
          name: displayName,
          city: city,
          locality: locality,
          zone_name: (s.zone_name && s.zone_name !== 'Unknown Central') ? s.zone_name : null,
          distance_km: Math.round(haversineKm(lat, lng, Number(s.latitude), Number(s.longitude)) * 100) / 100,
        };
      })
      .filter((s: any) => s.distance_km <= radiusKm)
      .sort((a: any, b: any) => a.distance_km - b.distance_km);

    // Group by platform
    const grouped: Record<string, any[]> = {};
    for (const store of results) {
      const platform = store.platform;
      if (!grouped[platform]) grouped[platform] = [];
      grouped[platform].push(store);
    }

    res.json({
      query: { lat, lng, radius_km: radiusKm },
      total: results.length,
      by_platform: grouped,
    });
  } catch (err) {
    console.error('[StoresRoutes] /nearby error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /cities
 * Return all unique cities with store counts.
 */
router.get('/cities', async (_req: Request, res: Response) => {
  try {
    const cities = await db('dark_stores')
      .select('city')
      .count('* as store_count')
      .whereNotNull('city')
      .groupBy('city')
      .orderBy('store_count', 'desc');

    // Also count stores with null city (from delivery_zone)
    const fromZones = await db('dark_stores')
      .select('delivery_zones.city')
      .count('* as store_count')
      .leftJoin('delivery_zones', 'dark_stores.delivery_zone_id', 'delivery_zones.id')
      .whereNull('dark_stores.city')
      .whereNotNull('delivery_zones.city')
      .groupBy('delivery_zones.city')
      .orderBy('store_count', 'desc');

    // Merge both lists
    const cityMap = new Map<string, number>();
    for (const row of cities as any[]) {
      cityMap.set(row.city, Number(row.store_count));
    }
    for (const row of fromZones as any[]) {
      const existing = cityMap.get(row.city) ?? 0;
      cityMap.set(row.city, existing + Number(row.store_count));
    }

    const result = Array.from(cityMap.entries())
      .map(([city, count]) => ({ city, store_count: count }))
      .sort((a, b) => b.store_count - a.store_count);

    res.json({ total_cities: result.length, cities: result });
  } catch (err) {
    console.error('[StoresRoutes] /cities error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /city/:cityName
 * Return all stores in a city, grouped by platform.
 */
router.get('/city/:cityName', async (req: Request, res: Response) => {
  try {
    const cityName = req.params.cityName;

    const stores = await db('dark_stores')
      .select(
        'dark_stores.*',
        'delivery_zones.name as zone_name',
        'delivery_zones.city as zone_city',
        'delivery_zones.base_risk',
      )
      .leftJoin('delivery_zones', 'dark_stores.delivery_zone_id', 'delivery_zones.id')
      .where(function () {
        this.whereRaw('LOWER(dark_stores.city) = ?', [cityName.toLowerCase()])
          .orWhereRaw('LOWER(delivery_zones.city) = ?', [cityName.toLowerCase()]);
      });

    // Group by platform
    const grouped: Record<string, any[]> = {};
    for (const store of stores) {
      const platform = (store as any).platform;
      if (!grouped[platform]) grouped[platform] = [];
      grouped[platform].push(store);
    }

    res.json({
      city: cityName,
      total: stores.length,
      by_platform: grouped,
    });
  } catch (err) {
    console.error('[StoresRoutes] /city/:cityName error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
