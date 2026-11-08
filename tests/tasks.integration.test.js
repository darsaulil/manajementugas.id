import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { app } from '../src/app.js';
import { hashPassword } from '../src/auth/password.js';
import { nicknameFromLoginId } from '../src/auth/nickname.js';
import { pool } from '../src/db/pool.js';

let server;
let baseUrl;
let testUserId;
let otherUserId;
let testLoginId;
let otherLoginId;
let ownerTaskId;
let ownerLoginId;
let ownerPassword;
let ownerNickname;
let createdTempOwner = false;
const mutatingTestsAllowed = process.env.ISOLATED_TEST_DATABASE === 'true'
  && process.env.ALLOW_MUTATING_TESTS === 'true';

function createClient() {
  const cookies = new Map();
  function capture(response) {
    for (const header of response.headers.getSetCookie?.() ?? []) {
      const [pair] = header.split(';', 1);
      const separator = pair.indexOf('=');
      if (separator < 0) continue;
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (value === '') cookies.delete(name);
      else cookies.set(name, value);
    }
  }
  return {
    csrf: () => cookies.get('mt_csrf') ?? '',
    async request(path, options = {}) {
      const headers = new Headers(options.headers ?? {});
      if (cookies.size > 0) headers.set('Cookie', [...cookies].map(([name, value]) => `${name}=${value}`).join('; '));
      const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
      capture(response);
      return { response, body: await response.json().catch(() => null) };
    },
  };
}

async function login(client, loginId, password = 'TaskPass!2026') {
  const result = await client.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginId, password }),
  });
  assert.equal(result.response.status, 200);
  return result;
}

async function insertUser(loginId, email) {
  const passwordHash = await hashPassword('TaskPass!2026');
  const result = await pool.query(`
    INSERT INTO users (login_id, nickname, email, role, password_hash, is_active, email_verified_at)
    VALUES ($1, $2, $3, 'user', $4, TRUE, NOW())
    RETURNING id
  `, [loginId, nicknameFromLoginId(loginId), email, passwordHash]);
  return result.rows[0].id;
}

async function ensureOwner(suffix) {
  // Prefer seed owner when present; otherwise create a temporary owner in isolated TEST DB.
  const seed = await pool.query(`SELECT login_id FROM users WHERE login_id = 'owner-demo' AND role = 'owner' AND is_active = TRUE LIMIT 1`);
  if (seed.rowCount > 0) {
    return { loginId: 'owner-demo', password: 'OwnerDemo!2026', nickname: 'Owner Demo', temp: false };
  }
  const loginId = `task-owner-${suffix}`;
  const password = 'OwnerDemo!2026';
  const nick = 'Task Temp Owner';
  const passwordHash = await hashPassword(password);
  await pool.query(
    `INSERT INTO users (login_id, nickname, email, role, password_hash, is_active, email_verified_at)
     VALUES ($1, $2, NULL, 'owner', $3, TRUE, NOW())`,
    [loginId, nick, passwordHash],
  );
  return { loginId, password, nickname: nick, temp: true };
}

before(async () => {
  if (!mutatingTestsAllowed) return;
  const suffix = Date.now().toString(36);
  testLoginId = `task-test-${suffix}`;
  otherLoginId = `task-other-${suffix}`;
  testUserId = await insertUser(testLoginId, `${testLoginId}@example.com`);
  otherUserId = await insertUser(otherLoginId, `${otherLoginId}@example.com`);
  const owner = await ensureOwner(suffix);
  ownerLoginId = owner.loginId;
  ownerPassword = owner.password;
  ownerNickname = owner.nickname;
  createdTempOwner = owner.temp;
  server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (!mutatingTestsAllowed) return;
  await pool.query('DELETE FROM tasks WHERE owner_id IN ($1, $2)', [testUserId, otherUserId]);
  if (ownerTaskId) await pool.query('DELETE FROM tasks WHERE id = $1', [ownerTaskId]);
  await pool.query('DELETE FROM sessions WHERE user_id IN ($1, $2)', [testUserId, otherUserId]);
  await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [testUserId, otherUserId]);
  if (createdTempOwner && ownerLoginId) {
    await pool.query('DELETE FROM tasks WHERE owner_id IN (SELECT id FROM users WHERE login_id = $1)', [ownerLoginId]);
    await pool.query('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE login_id = $1)', [ownerLoginId]);
    await pool.query('DELETE FROM users WHERE login_id = $1', [ownerLoginId]);
  }
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await pool.end();
});

test('task CRUD enforces ownership, persistence, filters, deadlines, status, and CSRF', { skip: mutatingTestsAllowed ? false : 'requires an isolated TEST_DATABASE_URL; never mutates the project database' }, async () => {
  const anonymous = createClient();
  assert.equal((await anonymous.request('/api/tasks')).response.status, 401);

  const user = createClient();
  await login(user, testLoginId);

  const invalid = await user.request('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': user.csrf() },
    body: JSON.stringify({ title: '', taskType: 'unknown', deadline: 'not-a-date' }),
  });
  assert.equal(invalid.response.status, 422);

  const noCsrf = await user.request('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'CSRF blocked', taskType: 'biasa', deadline: new Date(Date.now() + 86400000).toISOString() }),
  });
  assert.equal(noCsrf.response.status, 403);

  const regular = await user.request('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': user.csrf() },
    body: JSON.stringify({ title: 'Tugas API utama', description: 'Data harus bertahan setelah reload.', taskType: 'prioritas', deadline: new Date(Date.now() + 5 * 86400000).toISOString() }),
  });
  assert.equal(regular.response.status, 201);
  const regularTask = regular.body.data.task;
  assert.equal(regularTask.ownerId, testUserId);
  assert.equal(regularTask.status, 'pending');

  const overdue = await user.request('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': user.csrf() },
    body: JSON.stringify({ title: 'Tugas kedaluwarsa', taskType: 'ribet', deadline: new Date(Date.now() - 86400000).toISOString() }),
  });
  assert.equal(overdue.response.status, 201);
  assert.equal(overdue.body.data.task.isOverdue, true);

  const urgent = await user.request('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': user.csrf() },
    body: JSON.stringify({ title: 'Tugas mendesak', taskType: 'biasa', deadline: new Date(Date.now() + 86400000).toISOString() }),
  });
  assert.equal(urgent.response.status, 201);
  assert.equal(urgent.body.data.task.isUrgent, true);

  const search = await user.request('/api/tasks?search=API%20utama');
  assert.equal(search.response.status, 200);
  assert.equal(search.body.data.tasks.length, 1);
  assert.equal(search.body.data.tasks[0].id, regularTask.id);

  const overdueList = await user.request('/api/tasks?flag=overdue');
  assert.equal(overdueList.body.data.tasks.some((task) => task.id === overdue.body.data.task.id), true);
  const urgentList = await user.request('/api/tasks?flag=urgent');
  assert.equal(urgentList.body.data.tasks.some((task) => task.id === urgent.body.data.task.id), true);

  const update = await user.request(`/api/tasks/${regularTask.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': user.csrf() },
    body: JSON.stringify({ title: 'Tugas API diperbarui', status: 'completed' }),
  });
  assert.equal(update.response.status, 200);
  assert.equal(update.body.data.task.status, 'completed');
  assert.ok(update.body.data.task.completedAt);
  assert.equal(update.body.data.task.isUrgent, false);

  const detail = await user.request(`/api/tasks/${regularTask.id}`);
  assert.equal(detail.response.status, 200);
  assert.equal(detail.body.data.task.title, 'Tugas API diperbarui');

  const summary = await user.request('/api/tasks/summary');
  assert.equal(summary.response.status, 200);
  assert.ok(summary.body.data.summary.total >= 3);
  assert.ok(summary.body.data.summary.completed >= 1);

  const other = createClient();
  await login(other, otherLoginId);
  assert.equal((await other.request(`/api/tasks/${regularTask.id}`)).response.status, 404);
  assert.equal((await other.request(`/api/tasks/${regularTask.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': other.csrf() }, body: JSON.stringify({ title: 'Tidak boleh' }) })).response.status, 404);
  assert.equal((await other.request(`/api/tasks/${regularTask.id}`, { method: 'DELETE', headers: { 'X-CSRF-Token': other.csrf() } })).response.status, 404);

  const owner = createClient();
  await login(owner, ownerLoginId, ownerPassword);
  const ownerView = await owner.request(`/api/tasks/${regularTask.id}`);
  assert.equal(ownerView.response.status, 200);
  assert.equal(ownerView.body.data.task.id, regularTask.id);

  const ownerTask = await owner.request('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': owner.csrf() },
    body: JSON.stringify({ title: 'Tugas dibuat Owner', taskType: 'biasa', deadline: new Date(Date.now() + 86400000).toISOString() }),
  });
  assert.equal(ownerTask.response.status, 201);
  assert.equal(ownerTask.body.data.task.ownerLoginId, ownerLoginId);
  assert.equal(ownerTask.body.data.task.ownerNickname, ownerNickname);
  ownerTaskId = ownerTask.body.data.task.id;

  const deleted = await user.request(`/api/tasks/${regularTask.id}`, { method: 'DELETE', headers: { 'X-CSRF-Token': user.csrf() } });
  assert.equal(deleted.response.status, 204);
  assert.equal((await user.request(`/api/tasks/${regularTask.id}`)).response.status, 404);
});
