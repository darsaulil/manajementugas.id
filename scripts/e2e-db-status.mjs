/**
 * Read-only status check for the ISOLATED E2E test database (TEST_DATABASE_URL).
 * SAFETY: refuses if TEST_DATABASE_URL missing/equals DATABASE_URL. Never prints credentials.
 * Does NOT run migrations/seed/reset and performs SELECTs only.
 */
import 'dotenv/config';
import pg from 'pg';

function guard() {
  const main = (process.env.DATABASE_URL || '').trim();
  const test = (process.env.TEST_DATABASE_URL || '').trim();
  if (!test) throw new Error('GUARD: TEST_DATABASE_URL missing');
  if (!main) throw new Error('GUARD: DATABASE_URL missing (isolation check)');
  if (test === main) throw new Error('GUARD: TEST_DATABASE_URL equals DATABASE_URL');
  const mu = new URL(main), tu = new URL(test);
  if (mu.hostname === tu.hostname && mu.pathname === tu.pathname) {
    throw new Error('GUARD: same host and database path');
  }
  return test;
}

const testUrl = guard();
const pool = new pg.Pool({ connectionString: testUrl, ssl: testUrl.includes('neon.tech') ? { rejectUnauthorized: false } : undefined });
try {
  const tables = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('users','tasks','schema_migrations','sessions','email_verification_tokens','password_reset_tokens') ORDER BY table_name`);
  const migrations = await pool.query(`SELECT version FROM schema_migrations ORDER BY version`).catch(() => ({ rows: [] }));
  const owners = await pool.query(`SELECT login_id, is_active FROM users WHERE role='owner' ORDER BY login_id`).catch(() => ({ rows: [] }));
  const users = await pool.query(`SELECT login_id, is_active FROM users WHERE role='user' ORDER BY login_id`).catch(() => ({ rows: [] }));
  const counts = await pool.query(`SELECT (SELECT COUNT(*)::int FROM users) users, (SELECT COUNT(*)::int FROM tasks) tasks`).catch(() => ({ rows: [{}] }));
  console.log(JSON.stringify({
    target: 'TEST_DATABASE_URL (isolated, read-only)',
    tables: tables.rows.map((r) => r.table_name),
    migrations: migrations.rows.map((r) => r.version),
    owner_accounts: owners.rows,
    user_accounts: users.rows,
    counts: counts.rows[0],
    e2e_owner_ready: owners.rows.length > 0,
    e2e_user_ready: users.rows.length > 0,
  }, null, 2));
} catch (e) {
  console.log(JSON.stringify({ target: 'TEST_DATABASE_URL', status: 'query_failed', code: e.code || 'unknown' }));
  process.exitCode = 1;
} finally {
  await pool.end();
}
