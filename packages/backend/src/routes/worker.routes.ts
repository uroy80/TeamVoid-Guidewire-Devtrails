import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as workerService from '../services/worker.service.js';
import * as auditService from '../services/audit.service.js';
import { db } from '../config/database.js';
import { haversineDistance } from '@gigshield/shared';

const router = Router();

// All worker routes require authentication
router.use(authenticate);

// --- Schemas ---

const registerSchema = z.object({
  name: z.string().min(1).max(100),
  mobile: z.string().min(10).max(15).regex(/^\+?\d{10,15}$/, 'Invalid mobile number format'),
  platform: z.enum(['blinkit', 'zepto', 'instamart']),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  dark_store_id: z.string().uuid('Invalid dark store ID').optional(),
});

const locationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).default(0),
  source: z.enum(['GPS', 'NETWORK', 'IP']).default('GPS'),
  device_fingerprint: z.string().max(256).optional(),
});

// --- Routes ---

/**
 * POST /register
 * Register a new worker. Requires an authenticated session (post-OTP).
 */
router.post('/register', validate(registerSchema), async (req: AuthRequest, res: Response) => {
  try {
    const newWorker = await workerService.register(req.body);

    await auditService.log(
      'worker',
      newWorker.id,
      null,
      JSON.stringify({ status: 'registered', risk_tier: newWorker.risk_tier }),
      'WORKER_REGISTERED',
      { mobile: newWorker.mobile, platform: newWorker.platform }
    );

    // Generate a proper JWT with the new worker's ID
    const { generateToken } = await import('../services/auth.service.js');
    const token = generateToken(newWorker.id);

    res.status(201).json({ worker: newWorker, token });
  } catch (err) {
    const error = err as Error & { statusCode?: number };
    res.status(error.statusCode ?? 500).json({ error: error.message });
  }
});

/**
 * POST /acknowledge-exclusions
 * Worker acknowledges they have read and understood policy exclusions.
 */
router.post('/acknowledge-exclusions', async (req: AuthRequest, res: Response) => {
  try {
    const workerId = req.workerId;
    if (!workerId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const worker = await workerService.acknowledgeExclusions(workerId);

    await auditService.log(
      'worker',
      workerId,
      JSON.stringify({ exclusions_acknowledged: false }),
      JSON.stringify({ exclusions_acknowledged: true }),
      'EXCLUSIONS_ACKNOWLEDGED'
    );

    res.json({ acknowledged: true, worker });
  } catch (err) {
    const error = err as Error & { statusCode?: number };
    res.status(error.statusCode ?? 500).json({ error: error.message });
  }
});

/**
 * GET /me
 * Get the currently authenticated worker's profile.
 */
router.get('/me', async (req: AuthRequest, res: Response) => {
  try {
    const workerId = req.workerId;
    if (!workerId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const workerData = await workerService.getById(workerId);
    // Include dark store coordinates for map
    let storeCoords = null;
    if (workerData.dark_store_id) {
      const store = await db('dark_stores').where({ id: workerData.dark_store_id }).first();
      if (store) {
        storeCoords = { latitude: Number(store.latitude), longitude: Number(store.longitude), store_name: store.name };
      }
    }
    res.json({ ...workerData, ...storeCoords });
  } catch (err) {
    const error = err as Error & { statusCode?: number };
    res.status(error.statusCode ?? 500).json({ error: error.message });
  }
});

/**
 * POST /me/location
 * Submit a GPS ping from the worker's device for anti-spoofing tracking.
 */
router.post('/me/location', validate(locationSchema), async (req: AuthRequest, res: Response) => {
  try {
    const workerId = req.workerId;
    if (!workerId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { latitude, longitude, accuracy, source, device_fingerprint } = req.body;

    // Extract client IP from request headers (supports proxies)
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.socket?.remoteAddress
      || null;

    await workerService.updateLocation(
      workerId,
      latitude,
      longitude,
      accuracy,
      source,
      device_fingerprint,
      clientIp || undefined
    );

    // Zone validation: compute distance from worker's zone center
    const workerData = await db('workers').where({ id: workerId }).first();
    let in_zone: boolean | null = null;
    let distance_km: number | null = null;

    if (workerData?.delivery_zone_id) {
      const zone = await db('delivery_zones').where({ id: workerData.delivery_zone_id }).first();
      if (zone) {
        const distance = haversineDistance(
          latitude,
          longitude,
          Number(zone.latitude),
          Number(zone.longitude)
        );
        in_zone = distance < 10;
        distance_km = Math.round(distance * 100) / 100;
      }
    }

    res.json({ recorded: true, in_zone, distance_km });
  } catch (err) {
    const error = err as Error & { statusCode?: number };
    res.status(error.statusCode ?? 500).json({ error: error.message });
  }
});

/**
 * GET /me/location-trail
 * Get the worker's recent location pings (last 20).
 */
router.get('/me/location-trail', async (req: AuthRequest, res: Response) => {
  try {
    const workerId = req.workerId;
    if (!workerId) { res.status(401).json({ error: 'Auth required' }); return; }

    const trail = await db('worker_location_log')
      .where({ worker_id: workerId })
      .orderBy('recorded_at', 'desc')
      .limit(20)
      .select('latitude', 'longitude', 'accuracy_meters', 'source', 'recorded_at');

    res.json({ trail: trail.reverse() }); // oldest first for polyline
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
