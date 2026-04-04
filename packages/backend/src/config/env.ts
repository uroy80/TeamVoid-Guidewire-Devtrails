import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load .env from project root (4 levels up: config -> src -> backend -> packages -> root)
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '..', '.env') });

const envSchema = z.object({
  DATABASE_URL: z.string().default('postgres://gigshield:gigshield_dev@localhost:5432/gigshield'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().default('gigshield-dev-secret-change-in-production'),
  OPENAI_API_KEY: z.string().optional(),
  AQICN_API_KEY: z.string().default(''),
  FAST2SMS_API_KEY: z.string().default(''),
  TWILIO_ACCOUNT_SID: z.string().default(''),
  TWILIO_AUTH_TOKEN: z.string().default(''),
  TWILIO_VERIFY_SID: z.string().default(''),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export const env = envSchema.parse(process.env);
