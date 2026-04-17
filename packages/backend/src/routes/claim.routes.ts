import { Router, Response } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import * as claimService from '../services/claim.service.js';
import * as fraudService from '../services/fraud.service.js';
import * as payoutService from '../services/payout.service.js';

const router = Router();

const requestClaimSchema = z.object({
  disruption_type: z.string().min(1),
  description: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  device_fingerprint: z.string().max(256).optional(),
});

/**
 * POST /claims/request
 * Worker: manually request a claim
 */
router.post('/request', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const workerId = req.workerId;
    if (!workerId) { res.status(401).json({ error: 'Auth required' }); return; }

    const parsed = requestClaimSchema.parse(req.body);

    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.socket?.remoteAddress || undefined;

    const claim = await claimService.requestClaim(
      workerId,
      parsed.disruption_type,
      parsed.description,
      { latitude: parsed.latitude, longitude: parsed.longitude },
      parsed.device_fingerprint,
      clientIp
    );

    // Run fraud check on the new claim — manual claims always go to admin review
    const fraud_result = await fraudService.checkClaim(claim.id, 'MANUAL');

    res.status(201).json({ claim, fraud_result });
  } catch (err: any) {
    if (err.name === 'ZodError') {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    console.error('[ClaimRoutes] Error requesting claim:', err);
    res.status(err.message?.includes('No active policy') ? 400 : 500).json({ error: err.message });
  }
});

/**
 * GET /claims
 * Worker: get all claims for the authenticated worker
 */
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const claims = await claimService.getByWorker(req.workerId!);
    res.json({ claims });
  } catch (err) {
    console.error('[ClaimRoutes] Error fetching claims:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /claims/:id
 * Worker: get a specific claim with event and policy details
 */
router.get('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const claim = await claimService.getById(req.params.id);

    // Only allow worker to see their own claims
    if (claim.worker_id !== req.workerId && !req.isAdmin) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    res.json({ claim });
  } catch (err: any) {
    if (err.message?.includes('not found')) {
      res.status(404).json({ error: err.message });
      return;
    }
    console.error('[ClaimRoutes] Error fetching claim:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /claims/:id/payout
 * Worker: fetch the payout row for one of their claims. Returns 404 until
 * a payout has been initiated — frontend treats that as "no payout yet".
 *
 * Worker sees the same shape as admin, minus the raw gateway_response blob
 * (which contains internal fields not meant for end-users).
 */
router.get('/:id/payout', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const claim = await claimService.getById(req.params.id);
    if (claim.worker_id !== req.workerId && !req.isAdmin) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const payout = await payoutService.getByClaim(req.params.id);
    if (!payout) {
      res.status(404).json({ error: 'No payout yet for this claim' });
      return;
    }

    // Strip the gateway_response blob — it's internal. Workers get the
    // receipt-friendly subset: amounts, UTR, timestamps, status.
    const { gateway_response, ...safe } = payout as any;
    res.json({ payout: safe });
  } catch (err: any) {
    if (err.message?.includes('not found')) {
      res.status(404).json({ error: err.message });
      return;
    }
    console.error('[ClaimRoutes] Error fetching payout:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
