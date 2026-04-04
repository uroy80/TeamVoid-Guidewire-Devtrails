import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cron from 'node-cron';

import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.routes.js';
import workerRoutes from './routes/worker.routes.js';
import policyRoutes from './routes/policy.routes.js';
import claimRoutes from './routes/claim.routes.js';
import triggerRoutes from './routes/trigger.routes.js';
import adminRoutes from './routes/admin.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import storesRoutes from './routes/stores.routes.js';
import geoRoutes from './routes/geo.routes.js';
import demoRoutes from './routes/demo.routes.js';
import * as triggerService from './services/trigger.service.js';
import * as claimService from './services/claim.service.js';
import * as fraudService from './services/fraud.service.js';
import * as payoutService from './services/payout.service.js';

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'gigshield-api', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/workers', workerRoutes);
app.use('/api/policies', policyRoutes);
app.use('/api/claims', claimRoutes);
app.use('/api/triggers', triggerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/stores', storesRoutes);
app.use('/api/geo', geoRoutes);
app.use('/api/demo', demoRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Parametric Trigger Monitor - runs every 15 minutes
cron.schedule('*/15 * * * *', async () => {
  console.log('[TRIGGER MONITOR] Starting scheduled check...');
  try {
    const events = await triggerService.checkAllZones();
    if (events.length > 0) {
      console.log(`[TRIGGER MONITOR] ${events.length} new disruption event(s) detected`);

      // Process claims for each event
      for (const event of events) {
        const claims = await claimService.processDisruptionEvent(event.id);
        console.log(`[TRIGGER MONITOR] Created ${claims.length} claim(s) for event ${event.id}`);

        // Run fraud checks and process payouts
        for (const claim of claims) {
          const fraudResult = await fraudService.checkClaim(claim.id);
          console.log(`[TRIGGER MONITOR] Claim ${claim.claim_number}: fraud_score=${fraudResult.fraud_score}, tier=${fraudResult.tier}`);

          if (fraudResult.status === 'APPROVED') {
            await payoutService.processPayout(claim.id);
            console.log(`[TRIGGER MONITOR] Payout processed for claim ${claim.claim_number}`);
          }
        }
      }
    } else {
      console.log('[TRIGGER MONITOR] No new disruptions detected');
    }
  } catch (err) {
    console.error('[TRIGGER MONITOR] Error:', err);
  }
});

// Start server
app.listen(env.PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║     GigShield API Server                 ║
  ║     Port: ${env.PORT}                           ║
  ║     Env: ${env.NODE_ENV.padEnd(16)}           ║
  ║     Trigger Monitor: Every 15 min        ║
  ╚══════════════════════════════════════════╝
  `);
});

export default app;
