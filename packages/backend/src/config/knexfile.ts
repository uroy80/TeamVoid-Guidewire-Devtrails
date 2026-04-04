import 'dotenv/config';
import type { Knex } from 'knex';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config: Knex.Config = {
  client: 'pg',
  connection: process.env.DATABASE_URL || 'postgres://gigshield:gigshield_dev@localhost:5432/gigshield',
  pool: { min: 2, max: 10 },
  migrations: {
    directory: path.join(__dirname, '..', 'db', 'migrations'),
    extension: 'ts',
  },
  seeds: {
    directory: path.join(__dirname, '..', 'db', 'seeds'),
    extension: 'ts',
  },
};

export default config;
