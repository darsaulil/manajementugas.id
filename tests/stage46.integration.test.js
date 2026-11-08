import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { hashPassword } from '../src/auth/password.js';
import { nicknameFromLoginId } from '../src/auth/nickname.js';
import { app } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { assertOwnerStatusChange } from '../src/owner/service.js';
import { clearTestOutbox, getTestOutbox } from '../src/services/email.js';

let server;
let baseUrl;
let userId;
let ownerAId;
let ownerBId;
let loginId;
let ownerALogin;
let ownerBLogin;
let email;
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

async function insertUser(id, address, role) {
  const result = await pool.query(`
    INSERT INTO users (login_id, nickname, email, role, password_hash, is_active, email_verified_at)
    VALUES ($1, $2, $3, $4, $5, TRUE, NOW())
    RETURNING id
  `, [id, nicknameFromLoginId(id), address, role, await hashPassword(role === 'owner' ? 'OwnerStage46!2026' : 'UserStage46!2026')]);
  return result.rows[0].id;
}

async function login(client, id, password) {
  const result = await client.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginId: id, password }),
  });
  assert.equal(result.response.status, 200);
  return result;
}

before(async () => {
  if (!mutatingTestsAllowed) return;
  const suffix = Date.now().toString(36);
  loginId = `stage46-user-${suffix}`;
  ownerALogin = `stage46-owner-a-${suffix}`;
  ownerBLogin = `stage46-owner-b-${suffix}`;
  email = `${loginId}@example.com`;
  clearTestOutbox();
  userId = await insertUser(loginId, email, 'user');
  ownerAId = await insertUser(ownerALogin, `${ownerALogin}@example.com`, 'owner');
  ownerBId = await insertUser(ownerBLogin, `${ownerBLogin}@example.com`, 'owner');
  server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (!mutatingTestsAllowed) return;
  await pool.query('DELETE FROM tasks WHERE owner_id IN ($1, $2, $3)', [userId, ownerAId, ownerBId]);
  await pool.query('DELETE FROM sessions WHERE user_id IN ($1, $2, $3)', [userId, ownerAId, ownerBId]);
  await pool.query('DELETE FROM users WHERE id IN ($1, $2, $3)', [userId, ownerAId, ownerBId]);
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await pool.end();
});

test('aturan Owner melindungi Owner terakhir sebelum perubahan status', () => {
  assert.throws(
    () => assertOwnerStatusChange({ target: { id: 'owner-1', role: 'owner', is_active: true }, activeOwnerCount: 1, actorUserId: 'different-owner', isActive: false }),
    (error) => error.code === 'LAST_OWNER_PROTECTED',
  );
});

test('Tahap 4.6 menguji dashboard Owner, deactivation, laporan, settings, dan role isolation', { skip: mutatingTestsAllowed ? false : 'requires an isolated TEST_DATABASE_URL; never mutates the project database' }, async () => {
  const anonymous = createClient();
  assert.equal((await anonymous.request('/api/owner/overview')).response.status, 401);
  assert.equal((await anonymous.request('/api/reports')).response.status, 401);
  assert.equal((await anonymous.request('/api/account/me')).response.status, 401);
  assert.equal((await anonymous.request('/owner/dashboard')).response.status, 401);

  const user = createClient();
  await login(user, loginId, 'UserStage46!2026');
  assert.equal((await user.request('/api/owner/overview')).response.status, 403);
  assert.equal((await user.request('/owner/dashboard')).response.status, 403);
  assert.equal((await user.request('/dashboard')).response.status, 200);
  assert.equal((await user.request('/settings')).response.status, 200);

  const profile = await user.request('/api/account/me');
  assert.equal(profile.response.status, 200);
  assert.equal(profile.body.data.user.loginId, loginId);
  assert.equal(profile.body.data.user.role, 'user');
  assert.equal(profile.body.data.user.emailVerified, true);

  const wrongPassword = await user.request('/api/account/password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': user.csrf() },
    body: JSON.stringify({ currentPassword: 'WrongStage46!2026', password: 'NewStage46!2026', passwordConfirmation: 'NewStage46!2026' }),
  });
  assert.equal(wrongPassword.response.status, 401);

  const passwordChange = await user.request('/api/account/password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': user.csrf() },
    body: JSON.stringify({ currentPassword: 'UserStage46!2026', password: 'NewStage46!2026', passwordConfirmation: 'NewStage46!2026' }),
  });
  assert.equal(passwordChange.response.status, 200);
  assert.equal((await user.request('/api/account/me')).response.status, 200);

  const updatedEmail = `updated-${loginId}@example.com`;
  const emailChange = await user.request('/api/account/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': user.csrf() },
    body: JSON.stringify({ newEmail: updatedEmail, currentPassword: 'NewStage46!2026' }),
  });
  assert.equal(emailChange.response.status, 202);
  assert.equal(emailChange.body.data.emailVerified, false);
  const emailToken = getTestOutbox().find((item) => item.kind === 'verification' && item.to === updatedEmail);
  assert.ok(emailToken?.token);
  assert.equal((await user.request(`/api/auth/verify-email?token=${encodeURIComponent(emailToken.token)}`)).response.status, 200);
  const updatedProfile = await user.request('/api/account/me');
  assert.equal(updatedProfile.body.data.user.email, updatedEmail);
  assert.equal(updatedProfile.body.data.user.emailVerified, true);

  const task = await user.request('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': user.csrf() },
    body: JSON.stringify({ title: 'Laporan Stage 4.6', taskType: 'prioritas', deadline: new Date(Date.now() + 86400000).toISOString() }),
  });
  assert.equal(task.response.status, 201);
  const completed = await user.request(`/api/tasks/${task.body.data.task.id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': user.csrf() },
    body: JSON.stringify({ status: 'completed' }),
  });
  assert.equal(completed.response.status, 200);

  const today = new Date().toISOString().slice(0, 10);
  const daily = await user.request(`/api/reports?mode=daily&value=${today}`);
  assert.equal(daily.response.status, 200);
  assert.equal(daily.body.data.report.trend.length, 24);
  assert.ok(daily.body.data.report.summary.totalTasks >= 1);
  assert.ok(daily.body.data.report.summary.createdInPeriod >= 1);
  assert.ok(daily.body.data.report.summary.completedInPeriod >= 1);
  assert.equal(daily.body.data.report.summary.periodCompletionPercentage, 100);
  assert.equal((await user.request(`/api/reports?mode=daily&value=2000-01-01`)).body.data.report.summary.periodCompletionPercentage, 0);
  const monthly = await user.request(`/api/reports?mode=monthly&value=${today.slice(0, 7)}`);
  assert.equal(monthly.response.status, 200);
  assert.ok(monthly.body.data.report.trend.length >= 28);

  const owner = createClient();
  await login(owner, ownerALogin, 'OwnerStage46!2026');
  assert.equal((await owner.request('/owner/dashboard')).response.status, 200);
  assert.equal((await owner.request('/reports')).response.status, 200);
  const overview = await owner.request(`/api/owner/overview?search=${encodeURIComponent(loginId)}`);
  assert.equal(overview.response.status, 200);
  assert.equal(overview.body.data.overview.userSummaries.length, 1);
  assert.equal(overview.body.data.overview.userSummaries[0].loginId, loginId);
  assert.ok(overview.body.data.overview.tasks.total_tasks >= 1);

  const detail = await owner.request(`/api/owner/users/${userId}`);
  assert.equal(detail.response.status, 200);
  assert.equal(detail.body.data.user.loginId, loginId);
  assert.ok(detail.body.data.tasks.some((item) => item.id === task.body.data.task.id));
  const ownerReport = await owner.request(`/api/reports?mode=monthly&value=${today.slice(0, 7)}`);
  assert.equal(ownerReport.response.status, 200);
  assert.ok(ownerReport.body.data.report.comparison.some((item) => item.loginId === loginId));

  const inactive = await owner.request(`/api/owner/users/${userId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': owner.csrf() },
    body: JSON.stringify({ isActive: false }),
  });
  assert.equal(inactive.response.status, 200);
  assert.equal((await user.request('/api/account/me')).response.status, 401);
  const inactiveList = await owner.request('/api/owner/overview?status=inactive');
  assert.ok(inactiveList.body.data.overview.userSummaries.some((item) => item.loginId === loginId));

  const reactivated = await owner.request(`/api/owner/users/${userId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': owner.csrf() },
    body: JSON.stringify({ isActive: true }),
  });
  assert.equal(reactivated.response.status, 200);

  const ownerBStatus = await owner.request(`/api/owner/users/${ownerBId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': owner.csrf() },
    body: JSON.stringify({ isActive: false }),
  });
  assert.equal(ownerBStatus.response.status, 200);
  const lastOwner = await owner.request(`/api/owner/users/${ownerAId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': owner.csrf() },
    body: JSON.stringify({ isActive: false }),
  });
  assert.equal(lastOwner.response.status, 409);
  assert.equal(lastOwner.body.error.code, 'SELF_DEACTIVATION_FORBIDDEN');
  const ownerBSaved = await owner.request(`/api/owner/users/${ownerBId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': owner.csrf() },
    body: JSON.stringify({ isActive: true }),
  });
  assert.equal(ownerBSaved.response.status, 200);
});
