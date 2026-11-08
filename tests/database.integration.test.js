import assert from 'node:assert/strict';
import { after, test } from 'node:test';

import { pool } from '../src/db/pool.js';

test('database schema and foundation invariants hold (seed-aware, isolated-test safe)', async () => {
  const result = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM users) AS user_total,
      (SELECT COUNT(*)::int FROM users WHERE id = '10000000-0000-4000-8000-000000000001') AS seed_owner_total,
      (SELECT COUNT(*)::int FROM users WHERE id IN (
        '20000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000002',
        '20000000-0000-4000-8000-000000000003',
        '20000000-0000-4000-8000-000000000004',
        '20000000-0000-4000-8000-000000000005'
      )) AS seed_user_total,
      (SELECT COUNT(*)::int FROM tasks) AS task_total,
      (SELECT COUNT(*)::int FROM tasks WHERE id::text LIKE '30000000-0000-4000-8000-%') AS seed_task_total,
      (SELECT COUNT(*)::int FROM tasks WHERE id::text LIKE '30000000-0000-4000-8000-%' AND status = 'completed') AS seed_completed_total,
      (SELECT COUNT(*)::int FROM tasks WHERE id::text LIKE '30000000-0000-4000-8000-%' AND status = 'pending') AS seed_pending_total,
      (SELECT COUNT(*)::int FROM tasks WHERE id::text LIKE '30000000-0000-4000-8000-%' AND task_type = 'biasa') AS seed_biasa_total,
      (SELECT COUNT(*)::int FROM tasks WHERE id::text LIKE '30000000-0000-4000-8000-%' AND task_type = 'ribet') AS seed_ribet_total,
      (SELECT COUNT(*)::int FROM tasks WHERE id::text LIKE '30000000-0000-4000-8000-%' AND task_type = 'prioritas') AS seed_prioritas_total,
      (SELECT COUNT(*)::int FROM tasks t LEFT JOIN users u ON u.id = t.owner_id WHERE u.id IS NULL) AS orphan_task_total,
      (SELECT COUNT(*)::int FROM users WHERE id IN (
        '10000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000002',
        '20000000-0000-4000-8000-000000000003',
        '20000000-0000-4000-8000-000000000004',
        '20000000-0000-4000-8000-000000000005'
      ) AND password_hash LIKE 'scrypt$%') AS seed_scrypt_hash_total,
      (SELECT COUNT(*)::int FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'nickname') AS nickname_column_total,
      (SELECT COUNT(*)::int FROM users WHERE nickname IS NULL OR btrim(nickname) = '') AS missing_nickname_total,
      (SELECT COUNT(*)::int FROM (
        SELECT LOWER(nickname)
        FROM users
        GROUP BY LOWER(nickname)
        HAVING COUNT(*) > 1
      ) AS duplicate_nicknames) AS duplicate_nickname_total,
      (SELECT COUNT(*)::int FROM users WHERE password_hash IS NULL OR btrim(password_hash) = '') AS missing_password_hash_total,
      (SELECT COUNT(*)::int FROM users WHERE role NOT IN ('owner','user')) AS invalid_role_total
  `);
  const s = result.rows[0];

  // Core schema/integrity invariants (meaningful regardless of seed presence)
  assert.equal(s.nickname_column_total, 1, 'users.nickname column must exist');
  assert.equal(s.missing_nickname_total, 0, 'no missing nicknames');
  assert.equal(s.duplicate_nickname_total, 0, 'no duplicate nicknames');
  assert.equal(s.orphan_task_total, 0, 'no orphan tasks');
  assert.equal(s.missing_password_hash_total, 0, 'no missing password hashes');
  assert.equal(s.invalid_role_total, 0, 'roles must be owner/user');

  // Seed-aware invariants: validate only when seed data is present in the target DB
  const hasSeedUsers = s.seed_owner_total === 1 && s.seed_user_total === 5;
  const hasSeedTasks = s.seed_task_total > 0;
  if (hasSeedUsers) {
    assert.ok(s.user_total >= 6);
    assert.equal(s.seed_scrypt_hash_total, 6, 'seed users must use scrypt hashes');
  }
  if (hasSeedTasks) {
    assert.ok(s.task_total >= 15);
    assert.equal(s.seed_task_total, 15);
    assert.equal(s.seed_completed_total, 5);
    assert.equal(s.seed_pending_total, 10);
    assert.equal(s.seed_biasa_total, 5);
    assert.equal(s.seed_ribet_total, 5);
    assert.equal(s.seed_prioritas_total, 5);
  }
  // When seed is absent (isolated TEST DB), core integrity above still validates the schema/data.
});

after(async () => {
  await pool.end();
});
