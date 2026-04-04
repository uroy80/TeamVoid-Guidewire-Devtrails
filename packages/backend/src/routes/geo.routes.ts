import { Router, Request, Response } from 'express';
import { db } from '../config/database.js';

const router = Router();

/**
 * Haversine distance in kilometres between two lat/lng points.
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
 * GET /detect
 * Uses the request IP to detect location via ipapi.co.
 * For localhost/development, falls back to auto-detect endpoint.
 */
router.get('/detect', async (req: Request, res: Response) => {
  try {
    // Get client IP from request headers (behind proxy) or connection
    let ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.socket.remoteAddress
      || '';

    // Strip IPv6 loopback/mapped prefixes
    if (ip === '::1' || ip === '::ffff:127.0.0.1') ip = '127.0.0.1';

    const isLocal = ip === '127.0.0.1' || ip === 'localhost' || ip.startsWith('192.168.') || ip.startsWith('10.');

    // Choose endpoint: specific IP or auto-detect for local dev
    const url = isLocal
      ? 'https://ipapi.co/json/'
      : `https://ipapi.co/${ip}/json/`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'GigShield/1.0' },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`ipapi returned ${response.status}`);
    }

    const data = await response.json() as Record<string, any>;

    if (data.error) {
      throw new Error(data.reason || 'IP detection failed');
    }

    res.json({
      detected: true,
      city: data.city || null,
      state: data.region || null,
      latitude: data.latitude || null,
      longitude: data.longitude || null,
      country: data.country_name || data.country || null,
    });
  } catch (err) {
    console.error('[GeoRoutes] /detect error:', (err as Error).message);
    res.json({
      detected: false,
      fallback: {
        city: 'Mumbai',
        latitude: 19.076,
        longitude: 72.877,
      },
    });
  }
});

/**
 * GET /nearby-stores?lat={lat}&lng={lng}&radius={km}&platform={optional}
 * Find dark stores near the coordinates.
 * Uses bounding box pre-filter + haversine distance for accuracy.
 * Returns stores grouped by platform with distance in km.
 */
router.get('/nearby-stores', async (req: Request, res: Response) => {
  try {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);
    const radiusKm = parseFloat(req.query.radius as string) || 50;
    const platform = req.query.platform as string | undefined;

    if (isNaN(lat) || isNaN(lng)) {
      res.status(400).json({ error: 'lat and lng query parameters are required' });
      return;
    }

    // Rough bounding box filter (~111 km per degree latitude)
    const degBuffer = radiusKm / 111;

    let query = db('dark_stores')
      .select(
        'dark_stores.*',
        'delivery_zones.name as zone_name',
        'delivery_zones.city as zone_city',
        'delivery_zones.state as zone_state',
        'delivery_zones.base_risk',
      )
      .leftJoin('delivery_zones', 'dark_stores.delivery_zone_id', 'delivery_zones.id')
      .whereBetween('dark_stores.latitude', [lat - degBuffer, lat + degBuffer])
      .whereBetween('dark_stores.longitude', [lng - degBuffer, lng + degBuffer]);

    if (platform) {
      query = query.where('dark_stores.platform', platform);
    }

    const stores = await query;

    // Calculate distance and filter by exact radius
    const results = stores
      .map((s: any) => {
        const storeCity = (s.city && s.city !== 'Unknown') ? s.city : ((s.zone_city && s.zone_city !== 'Unknown') ? s.zone_city : null);
        const storeLocality = (s.locality && s.locality !== 'Unknown Central') ? s.locality : ((s.zone_name && s.zone_name !== 'Unknown Central') ? s.zone_name : null);
        // Build better display name for all platforms
        let displayName = s.name;
        const platformLabel = s.platform === 'blinkit' ? 'Blinkit' : s.platform === 'zepto' ? 'Zepto' : s.platform === 'instamart' ? 'Instamart' : s.platform;
        // If name is generic (store code, "Unknown", or just platform + ID), use locality
        const isGenericName = /Store\s*#|Unknown|^(Blinkit|Zepto|Instamart)\s+\d+$/i.test(displayName);
        if (isGenericName && storeLocality) {
          displayName = `${platformLabel} — ${storeLocality}`;
        } else if (displayName.includes('Unknown') && storeCity) {
          displayName = `${platformLabel} — ${storeCity}`;
        }
        return {
          id: s.id,
          store_code: s.store_code,
          name: displayName,
          platform: s.platform,
          latitude: Number(s.latitude),
          longitude: Number(s.longitude),
          city: storeCity,
          locality: storeLocality !== 'Unknown Central' ? storeLocality : null,
          delivery_zone_id: s.delivery_zone_id,
          zone_name: (s.zone_name && s.zone_name !== 'Unknown Central') ? s.zone_name : null,
          zone_state: (s.zone_state && s.zone_state !== 'Unknown') ? s.zone_state : null,
          base_risk: s.base_risk,
          distance_km: Math.round(haversineKm(lat, lng, Number(s.latitude), Number(s.longitude)) * 100) / 100,
        };
      })
      .filter((s: any) => s.distance_km <= radiusKm)
      .sort((a: any, b: any) => a.distance_km - b.distance_km);

    // Reverse geocode to fill in missing city/locality (max 5 lookups to stay fast)
    const unknowns = results.filter((s: any) => !s.city || !s.locality).slice(0, 5);
    if (unknowns.length > 0) {
      await Promise.all(unknowns.map(async (s: any) => {
        try {
          const rgRes = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${s.latitude}&lon=${s.longitude}&format=json&zoom=16&addressdetails=1`,
            { headers: { 'User-Agent': 'GigShield/1.0' } }
          );
          const rgData = await rgRes.json() as any;
          const addr = rgData.address || {};
          if (!s.city) s.city = addr.city || addr.town || addr.state_district || null;
          if (!s.locality) s.locality = addr.suburb || addr.neighbourhood || addr.village || addr.city_district || null;
          // Update nearby stores with same city
          if (s.city) {
            for (const other of results) {
              if (!other.city && haversineKm(s.latitude, s.longitude, other.latitude, other.longitude) < 5) {
                other.city = s.city;
              }
            }
          }
        } catch { /* skip */ }
      }));
    }

    // After reverse geocoding, fix any remaining "Unknown" display names
    for (const s of results) {
      if (s.name.includes('Unknown') || /Store\s*#\d+/i.test(s.name)) {
        const platformLabel = s.platform === 'blinkit' ? 'Blinkit' : s.platform === 'zepto' ? 'Zepto' : s.platform === 'instamart' ? 'Instamart' : s.platform;
        if (s.locality) {
          s.name = `${platformLabel} — ${s.locality}`;
        } else if (s.city) {
          s.name = `${platformLabel} — ${s.city}`;
        }
      }
    }

    // Group by platform
    const grouped: Record<string, any[]> = {};
    for (const store of results) {
      const p = store.platform;
      if (!grouped[p]) grouped[p] = [];
      grouped[p].push(store);
    }

    res.json({
      query: { lat, lng, radius_km: radiusKm, platform: platform || null },
      total: results.length,
      stores: results,
      by_platform: grouped,
    });
  } catch (err) {
    console.error('[GeoRoutes] /nearby-stores error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
