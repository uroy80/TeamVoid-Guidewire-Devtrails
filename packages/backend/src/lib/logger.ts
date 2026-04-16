import { createRequire } from 'module';
import pino, { type Logger, type LoggerOptions } from 'pino';
import { env } from '../config/env.js';

const level = process.env.LOG_LEVEL ?? 'info';
const requireFromHere = createRequire(import.meta.url);

function buildOptions(): LoggerOptions {
  const base: LoggerOptions = {
    level,
    base: { service: 'gigshield-api' },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (env.NODE_ENV === 'development') {
    try {
      // Require pino-pretty only if present; otherwise fall back to JSON.
      requireFromHere.resolve('pino-pretty');
      return {
        ...base,
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        },
      };
    } catch {
      return base;
    }
  }

  return base;
}

export const logger: Logger = pino(buildOptions());
