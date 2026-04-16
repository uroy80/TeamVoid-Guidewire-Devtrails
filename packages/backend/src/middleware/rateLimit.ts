import rateLimit, { type Options } from 'express-rate-limit';
import type { Request } from 'express';
import type { AuthRequest } from './auth.js';

/**
 * Shared key generator: prefer authenticated worker id, fall back to IP.
 * This makes authenticated limits stick to the user even across network changes
 * while still limiting anonymous callers by source address.
 */
function keyByWorkerOrIp(req: Request): string {
  const workerId = (req as AuthRequest).workerId;
  if (typeof workerId === 'string' && workerId.length > 0) return `w:${workerId}`;
  return `ip:${req.ip ?? 'unknown'}`;
}

const baseOptions: Partial<Options> = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: keyByWorkerOrIp,
};

/** 10 requests / 15 minutes per IP — applied to /api/auth/*. */
export const authLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  // For auth endpoints we intentionally key by IP only: we don't have an
  // authenticated worker yet and we want to stop credential-stuffing by source.
  keyGenerator: (req) => `ip:${req.ip ?? 'unknown'}`,
  message: { error: 'Too many auth attempts. Please try again later.' },
});

/** 20 requests / hour per authenticated worker — applied to /api/claims/request. */
export const claimLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 60 * 1000,
  limit: 20,
  message: { error: 'Claim request rate limit exceeded. Try again later.' },
});

/** 30 requests / hour per authenticated worker — applied to /api/community/report. */
export const reportLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 60 * 1000,
  limit: 30,
  message: { error: 'Community report rate limit exceeded. Try again later.' },
});

/** 300 requests / 15 minutes — applied globally as a last-resort backstop. */
export const generalLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: 300,
  message: { error: 'Too many requests. Please slow down.' },
});
