import pg from 'pg';

import { env } from '../config/env.js';

const { Pool } = pg;

function secureDatabaseUrl(value) {
  const url = new URL(value);
  const sslMode = url.searchParams.get('sslmode');

  if (['prefer', 'require', 'verify-ca'].includes(sslMode)) {
    url.searchParams.set('sslmode', 'verify-full');
  }

  return url.toString();
}

export const pool = new Pool({
  // Neon certificates are verified against the database hostname.
  connectionString: secureDatabaseUrl(env.databaseUrl),
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  allowExitOnIdle: true,
});

pool.on('error', () => {
  console.error('Unexpected idle database client error.');
});
