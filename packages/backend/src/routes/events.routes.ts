import { Router, Response } from 'express';
import jwt from 'jsonwebtoken';
import { events, type EventPayload } from '../services/events.service.js';
import { env } from '../config/env.js';

const router = Router();

/**
 * GET /api/admin/events/stream
 *
 * Server-Sent Events endpoint for the admin Live Ops War Room.
 *
 * Auth: JWT token passed via `?token=...` query param (EventSource API
 * doesn't support custom headers in browsers). Only admin tokens accepted.
 *
 * Keeps connection alive with a comment-frame heartbeat every 25s
 * to survive proxies/load-balancers that drop idle connections (Cloudflare 100s).
 */
router.get('/stream', (req, res: Response) => {
  const token = req.query.token as string | undefined;
  if (!token) {
    res.status(401).json({ error: 'Missing token' });
    return;
  }
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { isAdmin?: boolean; workerId?: string };
    if (!payload.isAdmin) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
  } catch {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  res.flushHeaders?.();

  // Send an initial "connected" comment so the client knows we're live
  res.write(': connected\n\n');

  const listener = (payload: EventPayload) => {
    try {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch {
      // connection broken; cleanup on 'close'
    }
  };

  events.on('event', listener);

  // Heartbeat every 25s — comment frame to keep connection alive
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      // ignore
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    events.off('event', listener);
    try { res.end(); } catch { /* */ }
  });
});

export default router;
