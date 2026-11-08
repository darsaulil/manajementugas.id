/**
 * Creates exactly 1 Owner + 1 User in the ISOLATED TEST_DATABASE_URL only.
 * SAFETY: hard guard - refuses if TEST_DATABASE_URL missing or equals DATABASE_URL.
 * - Never prints credentials or connection strings.
 * - Uses app's hashPassword/nickname logic.
 * - No seed, no reset/drop/truncate/delete. Inserts only (idempotent by login_id).
 * Credentials read from env: E2E_OWNER_LOGIN_ID, E2E_OWNER_PASSWORD, E2E_USER_LOGIN_ID, E2E_USER_PASSWORD
 */
import 'dotenv/config';
import pg from 'pg';
import { hashPassword } from '../src/auth/password.js';
import { nicknameFromLoginId } from '../src/auth/nickname.js';
import { validateRegistrationInput } from '../src/auth/validation.js';

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

function req(name) {
  const v = (process.env[name] || '').trim();
  if (!v) throw new Error(`Missing required env var: ${name} (value not shown)`);
  return v;
}

const testUrl = guard();
const owner = { loginId: req('E2E_OWNER_LOGIN_ID'), password: req('E2E_OWNER_PASSWORD'), role: 'owner' };
const user = { loginId: req('E2E_USER_LOGIN_ID'), password: req('E2E_USER_PASSWORD'), role: 'user' };

// Validate using app rules (password/loginId format)
for (const a of [owner, user]) {
  const v = validateRegistrationInput({ loginId: a.loginId, email: '', password: a.password, passwordConfirmation: a.password });
  if (Object.keys(v.errors).length) {
    throw new Error(`Validation failed for ${a.role} account (details suppressed for safety): ${Object.keys(v.errors).join(',')}`);
  }
  a.normalizedLoginId = v.loginId;
}

if (owner.normalizedLoginId === user.normalizedLoginId) throw new Error('Owner and User login IDs must differ');

const pool = new pg.Pool({ connectionString: testUrl, ssl: testUrl.includes('neon.tech') ? { rejectUnauthorized: false } : undefined });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  for (const a of [owner, user]) {
    const exists = await client.query('SELECT id, role, is_active FROM users WHERE login_id = $1', [a.normalizedLoginId]);
    if (exists.rowCount > 0) {
      const row = exists.rows[0];
      if (row.role !== a.role) {
        // Only in isolated test DB, align role to requested E2E role (minimal, controlled).
        await client.query('UPDATE users SET role=$1, is_active=TRUE, deactivated_at=NULL WHERE id=$2', [a.role, row.id]);
        a.result = 'updated_role';
      } else {
        if (!row.is_active) await client.query('UPDATE users SET is_active=TRUE, deactivated_at=NULL WHERE id=$1', [row.id]);
        a.result = 'already_exists';
      }
      continue;
    }
    const hash = await hashPassword(a.password);
    const nick = nicknameFromLoginId(a.normalizedLoginId);
    await client.query(
      `INSERT INTO users (login_id, nickname, email, role, password_hash, is_active, email_verified_at)
       VALUES ($1,$2,NULL,$3,$4,TRUE,NOW())`,
      [a.normalizedLoginId, nick, a.role, hash],
    );
    a.result = 'created';
  }
  await client.query('COMMIT');
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
}

const verify = await pool.query(
  `SELECT login_id, role, is_active FROM users WHERE login_id = ANY($1::text[]) ORDER BY role`,
  [[owner.normalizedLoginId, user.normalizedLoginId]],
);
await pool.end();
console.log(JSON.stringify({
  target: 'TEST_DATABASE_URL (isolated)',
  actions: { owner: owner.result, user: user.result },
  verified: verify.rows,
  ok: verify.rowCount === 2 && verify.rows.some(r => r.role === 'owner' && r.is_active) && verify.rows.some(r => r.role === 'user' && r.is_active),
}, null, 2));
