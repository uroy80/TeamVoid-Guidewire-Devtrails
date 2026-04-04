import { Router, Request, Response } from 'express';
import { db } from '../config/database.js';
import * as triggerService from '../services/trigger.service.js';
import * as claimService from '../services/claim.service.js';
import * as fraudService from '../services/fraud.service.js';
import * as payoutService from '../services/payout.service.js';
import { v4 as uuid } from 'uuid';

const router = Router();

/**
 * POST /api/demo/simulate
 * Simulate fraud scenarios for hackathon demo.
 * Body: { scenario: 'legitimate_claim' | 'gps_spoofing' | 'ring_fraud', worker_id?: string }
 */
router.post('/simulate', async (req: Request, res: Response) => {
  try {
    const { scenario, worker_id } = req.body;

    // Find a demo worker with an active policy (required for claims)
    let workerId = worker_id;
    if (!workerId) {
      const workerWithPolicy = await db('workers')
        .join('policies', 'workers.id', 'policies.worker_id')
        .where('policies.status', 'ACTIVE')
        .whereNotNull('workers.delivery_zone_id')
        .select('workers.id')
        .first();
      if (!workerWithPolicy) { res.status(400).json({ error: 'No workers with active policies found. Purchase a policy first.' }); return; }
      workerId = workerWithPolicy.id;
    }

    const workerData = await db('workers').where({ id: workerId }).first();
    if (!workerData) { res.status(404).json({ error: 'Worker not found' }); return; }

    const zone = await db('delivery_zones').where({ id: workerData.delivery_zone_id }).first();
    if (!zone) { res.status(404).json({ error: 'Zone not found' }); return; }

    const results: any = { scenario, worker: { id: workerId, name: workerData.name }, zone: zone.name };

    if (scenario === 'legitimate_claim') {
      // Inject 10 legitimate GPS pings in the worker's zone
      const now = Date.now();
      for (let i = 0; i < 10; i++) {
        await db('worker_location_log').insert({
          worker_id: workerId,
          latitude: Number(zone.latitude) + (Math.random() - 0.5) * 0.005,
          longitude: Number(zone.longitude) + (Math.random() - 0.5) * 0.005,
          accuracy_meters: 10 + Math.random() * 20,
          source: 'GPS',
          device_fingerprint: `demo-legit-${workerId.slice(0, 8)}`,
          recorded_at: new Date(now - (10 - i) * 6 * 60 * 1000), // every 6 min
        });
      }

      // Create disruption event
      const [event] = await db('disruption_events').insert({
        event_type: 'HEAVY_RAINFALL',
        severity: 'SEVERE',
        delivery_zone_id: zone.id,
        duration_estimate_hours: 6,
        source_data: JSON.stringify({ rainfall_mm: 80, source: 'Demo' }),
        verified_by_sources: '{Demo}',
        event_timestamp: new Date(),
      }).returning('*');

      // Process claims
      const claims = await claimService.processDisruptionEvent(event.id);
      const workerClaim = claims.find((c: any) => c.worker_id === workerId);

      if (workerClaim) {
        const fraudResult = await fraudService.checkClaim(workerClaim.id);
        results.event = { id: event.id, type: 'HEAVY_RAINFALL' };
        results.claim = { id: workerClaim.id, number: workerClaim.claim_number, payout: workerClaim.income_loss_payout };
        results.fraud = fraudResult;

        if (fraudResult.status === 'APPROVED') {
          const payout = await payoutService.processPayout(workerClaim.id);
          results.payout = { status: payout.status, amount: payout.amount };
        }
      }

    } else if (scenario === 'gps_spoofing') {
      // Inject 5 legit pings, then 5 pings 500km away (impossible travel)
      const now = Date.now();
      for (let i = 0; i < 5; i++) {
        await db('worker_location_log').insert({
          worker_id: workerId,
          latitude: Number(zone.latitude) + (Math.random() - 0.5) * 0.003,
          longitude: Number(zone.longitude) + (Math.random() - 0.5) * 0.003,
          accuracy_meters: 15,
          source: 'GPS',
          device_fingerprint: `demo-spoof-${workerId.slice(0, 8)}`,
          recorded_at: new Date(now - (10 - i) * 3 * 60 * 1000),
        });
      }
      // Teleport 5 degrees (~500km) away
      for (let i = 5; i < 10; i++) {
        await db('worker_location_log').insert({
          worker_id: workerId,
          latitude: Number(zone.latitude) + 5 + (Math.random() - 0.5) * 0.003,
          longitude: Number(zone.longitude) + 5 + (Math.random() - 0.5) * 0.003,
          accuracy_meters: 500, // Spoofing apps have high accuracy values
          source: 'GPS',
          device_fingerprint: `demo-spoof-new-device`,
          recorded_at: new Date(now - (10 - i) * 3 * 60 * 1000),
        });
      }

      // Create event and claim
      const [event] = await db('disruption_events').insert({
        event_type: 'HEAVY_RAINFALL',
        severity: 'SEVERE',
        delivery_zone_id: zone.id,
        duration_estimate_hours: 6,
        source_data: JSON.stringify({ rainfall_mm: 75, source: 'Demo-Spoof' }),
        verified_by_sources: '{Demo}',
        event_timestamp: new Date(),
      }).returning('*');

      const claims = await claimService.processDisruptionEvent(event.id);
      const workerClaim = claims.find((c: any) => c.worker_id === workerId);

      if (workerClaim) {
        const fraudResult = await fraudService.checkClaim(workerClaim.id);
        results.event = { id: event.id, type: 'HEAVY_RAINFALL' };
        results.claim = { id: workerClaim.id, number: workerClaim.claim_number, status: fraudResult.status };
        results.fraud = fraudResult;
        results.flags = (fraudResult.details as any)?.flags || [];
        results.message = 'GPS spoofing detected! Claim flagged for review.';
      }

    } else if (scenario === 'ring_fraud') {
      // Create 3 fake workers sharing the same device fingerprint
      const sharedFingerprint = `ring-fraud-device-${Date.now()}`;

      for (let i = 0; i < 3; i++) {
        // Insert location pings with shared device
        await db('worker_location_log').insert({
          worker_id: workerId,
          latitude: Number(zone.latitude) + (Math.random() - 0.5) * 0.002,
          longitude: Number(zone.longitude) + (Math.random() - 0.5) * 0.002,
          accuracy_meters: 15,
          source: 'GPS',
          device_fingerprint: sharedFingerprint,
          recorded_at: new Date(Date.now() - i * 60 * 1000),
        });

        // Insert device fingerprint records pointing to different "workers"
        // Check if fingerprint already exists for this worker
        const existing = await db('device_fingerprints')
          .where({ worker_id: workerId, fingerprint_hash: sharedFingerprint })
          .first();
        if (!existing) {
          await db('device_fingerprints').insert({
            worker_id: workerId,
            fingerprint_hash: sharedFingerprint,
            user_agent: 'Mozilla/5.0 Ring Fraud Demo',
            screen_resolution: '1080x2400',
            timezone_offset: -330,
            language: 'en',
          });
        }
      }

      // Create event
      const [event] = await db('disruption_events').insert({
        event_type: 'SOCIAL_DISRUPTION',
        severity: 'MODERATE',
        delivery_zone_id: zone.id,
        duration_estimate_hours: 8,
        source_data: JSON.stringify({ source: 'Demo-Ring' }),
        verified_by_sources: '{Demo}',
        event_timestamp: new Date(),
      }).returning('*');

      const claims = await claimService.processDisruptionEvent(event.id);
      const workerClaim = claims.find((c: any) => c.worker_id === workerId);

      if (workerClaim) {
        const fraudResult = await fraudService.checkClaim(workerClaim.id);
        results.event = { id: event.id, type: 'SOCIAL_DISRUPTION' };
        results.claim = { id: workerClaim.id, number: workerClaim.claim_number };
        results.fraud = fraudResult;
        results.message = 'Ring fraud detected! Multiple claims from same device.';
      }

    } else {
      res.status(400).json({ error: 'Invalid scenario. Use: legitimate_claim, gps_spoofing, ring_fraud' });
      return;
    }

    res.json(results);
  } catch (err: any) {
    console.error('[Demo] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
