import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cron from 'node-cron';

import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { httpLogger } from './middleware/httpLogger.js';
import { metricsMiddleware, metricsHandler } from './middleware/metrics.js';
import { authLimiter, claimLimiter, reportLimiter, generalLimiter } from './middleware/rateLimit.js';
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
import publicRoutes from './routes/public.routes.js';
import eventsRoutes from './routes/events.routes.js';
import communityRoutes from './routes/community.routes.js';
import actuarialRoutes from './routes/actuarial.routes.js';
import * as triggerService from './services/trigger.service.js';
import * as claimService from './services/claim.service.js';
import * as fraudService from './services/fraud.service.js';
import * as payoutService from './services/payout.service.js';
import { events } from './services/events.service.js';
import { logger } from './lib/logger.js';

const app = express();

// Core middleware
app.use(helmet());
app.use(cors());
app.use(httpLogger);
app.use(express.json());

// Prometheus metrics — must be registered BEFORE routes so res.finish timing is accurate.
app.use(metricsMiddleware);
app.get('/metrics', metricsHandler);

// Global rate limit backstop (keyed by worker id when authenticated, else IP).
app.use(generalLimiter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'gigshield-api', timestamp: new Date().toISOString() });
});

// Auth routes get a tighter per-IP limiter to stop credential stuffing.
app.use('/api/auth', authLimiter, authRoutes);

// Workers, policies etc.
app.use('/api/workers', workerRoutes);
app.use('/api/policies', policyRoutes);

// Per-endpoint limiters for the two abuse-prone worker actions.
app.use('/api/claims/request', claimLimiter);
app.use('/api/claims', claimRoutes);

app.use('/api/triggers', triggerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/actuarial', actuarialRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/stores', storesRoutes);
app.use('/api/geo', geoRoutes);
app.use('/api/demo', demoRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/admin/events', eventsRoutes);

app.use('/api/community/report', reportLimiter);
app.use('/api/community', communityRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Parametric Trigger Monitor - runs every 15 minutes
cron.schedule('*/15 * * * *', async () => {
  logger.info('[TRIGGER MONITOR] Starting scheduled check...');
  try {
    const disruptionEvents = await triggerService.checkAllZones();
    if (disruptionEvents.length > 0) {
      logger.info({ count: disruptionEvents.length }, '[TRIGGER MONITOR] disruption events detected');

      // Process claims for each event
      for (const event of disruptionEvents) {
        events.emitEvent('TRIGGER_FIRED', {
          event_id: event.id,
          event_type: event.event_type,
          severity: event.severity,
          zone_id: event.delivery_zone_id,
        });

        const claims = await claimService.processDisruptionEvent(event.id);
        logger.info({ count: claims.length, eventId: event.id }, '[TRIGGER MONITOR] claims created');

        // Run fraud checks and process payouts
        for (const claim of claims) {
          const fraudResult = await fraudService.checkClaim(claim.id);
          logger.info(
            { claim: claim.claim_number, fraud_score: fraudResult.fraud_score, tier: fraudResult.tier },
            '[TRIGGER MONITOR] claim fraud check',
          );

          if (fraudResult.status === 'APPROVED') {
            await payoutService.processPayout(claim.id);
            logger.info({ claim: claim.claim_number }, '[TRIGGER MONITOR] payout processed');
          }
        }
      }
    } else {
      logger.info('[TRIGGER MONITOR] No new disruptions detected');
    }
  } catch (err) {
    logger.error({ err }, '[TRIGGER MONITOR] error');
  }
});

// Start server
app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'GigShield API server started');
});

export default app;
