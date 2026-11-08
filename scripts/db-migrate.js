import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { pool } from '../src/db/pool.js';

const currentFile = fileURLToPath(import.meta.url);
const projectDirectory = path.resolve(path.dirname(currentFile), '..');
const migrationsDirectory = path.join(projectDirectory, 'migrations');

function checksum(sql) {
  return createHash('sha256').update(sql).digest('hex');
}

async function run() {
  const client = await pool.connect();

  try {
    await client.query('SELECT pg_advisory_lock($1)', [4815162342]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const files = (await readdir(migrationsDirectory))
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const version = file.replace(/\.sql$/, '');
      const sql = await readFile(path.join(migrationsDirectory, file), 'utf8');
      const digest = checksum(sql);
      const existing = await client.query(
        'SELECT checksum FROM schema_migrations WHERE version = $1',
        [version],
      );

      if (existing.rowCount > 0) {
        if (existing.rows[0].checksum !== digest) {
          throw new Error(`Migration checksum mismatch for ${version}.`);
        }
        console.log(`Migration ${version} already applied.`);
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)',
          [version, digest],
        );
        await client.query('COMMIT');
        console.log(`Applied migration ${version}.`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    if (files.length === 0) {
      console.log('No migration files found.');
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [4815162342]).catch(() => {});
    client.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error('Migration failed.');
  process.exitCode = 1;
});
