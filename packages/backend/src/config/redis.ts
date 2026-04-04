import Redis from 'ioredis';
import { env } from './env.js';

export const redis = new (Redis as any)(env.REDIS_URL, {
  maxRetriesPerRequest: null, // required by BullMQ
  enableReadyCheck: false,
});

redis.on('error', (err: Error) => {
  console.error('Redis connection error:', err.message);
});
