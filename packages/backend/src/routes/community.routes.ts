import { Router, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin, type AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as communityService from '../services/community.service.js';

const router = Router();

const reportSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  condition_type: z.enum(['RAIN', 'FLOOD', 'HEAT', 'POLLUTION', 'STRIKE']),
  severity: z.enum(['MILD', 'MODERATE', 'SEVERE']).default('MODERATE'),
  notes: z.string().max(500).optional(),
  // Client-sourced device fingerprint. Used as the *primary* distinct-ness
  // signal when detecting community clusters — distinct IPs alone can be
  // faked by a single phone on 3 Wi-Fi networks, distinct devices can't.
  device_fingerprint: z.string().max(256).optional(),
});

/**
 * POST /api/community/report
 * Worker submits a ground-truth condition report. If a cluster forms,
 * a provisional disruption event is auto-created.
 */
router.post('/report', requireAuth, validate(reportSchema), async (req: AuthRequest, res: Response) => {
  try {
    const workerId = req.workerId;
    if (!workerId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.socket?.remoteAddress
      || undefined;

    const result = await communityService.submitReport({
      workerId,
      latitude: req.body.latitude,
      longitude: req.body.longitude,
      conditionType: req.body.condition_type,
      severity: req.body.severity,
      notes: req.body.notes,
      ipAddress,
      deviceFingerprint: req.body.device_fingerprint,
    });

    res.status(201).json(result);
  } catch (err: any) {
    console.error('[CommunityRoutes] submitReport error:', err);
    res.status(500).json({ error: err.message || 'Failed to submit report' });
  }
});

/**
 * GET /api/community/admin/pending
 * Admin: list unverified reports awaiting validation or clustering.
 */
router.get('/admin/pending', requireAuth, requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const reports = await communityService.getPendingReports(100);
    res.json({ reports });
  } catch (err) {
    console.error('[CommunityRoutes] getPending error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
