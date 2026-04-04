import { Router, Request, Response } from 'express';
import { requireAuth, requireAdmin, type AuthRequest } from '../middleware/auth.js';
import * as triggerService from '../services/trigger.service.js';
import * as claimService from '../services/claim.service.js';
import * as fraudService from '../services/fraud.service.js';
import { db } from '../config/database.js';

const router = Router();

/**
 * GET /triggers/status
 * Public: get current weather/AQI for all zones
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const zones = await db('delivery_zones').select('*').whereNot('city', 'Unknown').where('latitude', '!=', 0);
    const results = await Promise.all(
      zones.map(async (zone) => {
        try {
          const data = await triggerService.getZoneWeather(zone.id);
          return { zone_id: zone.id, name: zone.name, city: zone.city, ...data };
        } catch (err) {
          return {
            zone_id: zone.id,
            name: zone.name,
            city: zone.city,
            error: 'Failed to fetch environment data',
          };
        }
      })
    );
    res.json({ zones: results });
  } catch (err) {
    console.error('[TriggerRoutes] Error fetching zone status:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /triggers/check-now
 * Admin: force trigger check across all zones
 */
router.post(
  '/check-now',
  requireAuth,
  requireAdmin,
  async (_req: AuthRequest, res: Response) => {
    try {
      const newEvents = await triggerService.checkAllZones();
      res.json({
        message: `Trigger check complete. ${newEvents.length} new event(s) created.`,
        events: newEvents,
      });
    } catch (err) {
      console.error('[TriggerRoutes] Error running trigger check:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * POST /triggers/manual
 * Admin: create a manual disruption event
 */
router.post(
  '/manual',
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const { zone_id, event_type, severity, duration_hours } = req.body;

      if (!zone_id || !event_type || !severity || !duration_hours) {
        res
          .status(400)
          .json({ error: 'zone_id, event_type, severity, and duration_hours are required' });
        return;
      }

      const event = await triggerService.createManualEvent(
        zone_id,
        event_type,
        severity,
        duration_hours
      );

      // Auto-create claims for all workers with active policies in the affected zone
      const claims = await claimService.processDisruptionEvent(event.id);

      // Run fraud check on each claim
      const fraudResults = [];
      for (const claim of claims) {
        try {
          const result = await fraudService.checkClaim(claim.id, 'ADMIN_TRIGGER');
          fraudResults.push({ claim_id: claim.id, claim_number: claim.claim_number, ...result });
        } catch { /* skip individual failures */ }
      }

      res.status(201).json({
        event,
        claims_created: claims.length,
        claims: claims.map((c: any) => ({ id: c.id, claim_number: c.claim_number, worker_id: c.worker_id, payout: c.income_loss_payout })),
        fraud_results: fraudResults,
      });
    } catch (err) {
      console.error('[TriggerRoutes] Error creating manual event:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
