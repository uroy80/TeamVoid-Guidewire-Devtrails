import { pinoHttp } from 'pino-http';
import type { Options as PinoHttpOptions } from 'pino-http';
import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import { logger } from '../lib/logger.js';

/**
 * Structured HTTP request/response logger.
 *
 * - Assigns a UUID to each request (req.id), included in every log line.
 * - Redacts auth-sensitive headers and body fields so they never hit stdout.
 * - Emits a single JSON line per request (or pretty line in dev).
 */
const options: PinoHttpOptions = {
  logger,
  genReqId: (req: IncomingMessage): string => {
    const existing = req.headers['x-request-id'];
    if (typeof existing === 'string' && existing.length > 0) return existing;
    return randomUUID();
  },
  customLogLevel: (_req: IncomingMessage, res: ServerResponse, err?: Error) => {
    if (err) return 'error';
    if (res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.token',
    ],
    censor: '[REDACTED]',
  },
};

export const httpLogger = pinoHttp(options);
