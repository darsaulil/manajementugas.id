import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { app } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { nicknameFromLoginId } from '../src/auth/nickname.js';
import { hashPassword } from '../src/auth/password.js';
import { getTestOutbox, clearTestOutbox } from '../src/services/email.js';
import { createOpaqueToken, hashOpaqueToken } from '../src/auth/tokens.js';

let server;
let baseUrl;
let testLoginId;
let testEmail;
const mutatingTestsAllowed = process.env.ISOLATED_TEST_DATABASE === 'true'
  && process.env.ALLOW_MUTATING_TESTS === 'true';

function createClient() {
  const cookies = new Map();

  function capture(response) {
    const setCookies = response.headers.getSetCookie?.() ?? [];
    for (const header of setCookies) {
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
    snapshot() { return new Map(cookies); },
    csrf() { return cookies.get('mt_csrf') ?? ''; },
    async request(path, options = {}) {
      const headers = new Headers(options.headers ?? {});
      if (cookies.size > 0) headers.set('Cookie', [...cookies].map(([name, value]) => `${name}=${value}`).join('; '));
      const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
      capture(response);
      const body = await response.json().catch(() => null);
      return { response, body };
    },
  };
}

before(async () => {
  if (!mutatingTestsAllowed) return;
  testLoginId = `auth-test-${Date.now().toString(36)}`;
  testEmail = `${testLoginId}@example.com`;
  clearTestOutbox();
  server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (!mutatingTestsAllowed) return;
  await pool.query("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE login_id IN ($1, 'owner-demo'))", [testLoginId]);
  await pool.query('DELETE FROM users WHERE login_id = $1', [testLoginId]);
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await pool.end();
});

test('authentication flows enforce registration, verification, login, role access, CSRF, reset, and sessions', { skip: mutatingTestsAllowed ? false : 'requires an isolated TEST_DATABASE_URL; never mutates the project database' }, async () => {
  const publicClient = createClient();
  const registration = await publicClient.request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginId: testLoginId, email: testEmail, password: 'TestPass!2026', passwordConfirmation: 'TestPass!2026', role: 'owner' }),
  });
  assert.equal(registration.response.status, 201);
  assert.equal(registration.body.data.user.role, 'user');
  assert.equal(registration.body.data.user.nickname, nicknameFromLoginId(testLoginId));
  assert.equal(registration.body.data.redirectPath, '/dashboard');
  assert.match(publicClient.snapshot().get('mt_session'), /.+/);
  assert.equal((await publicClient.request('/api/auth/me')).response.status, 200);
  assert.equal((await publicClient.request('/dashboard')).response.status, 200);

  const storedUser = await pool.query('SELECT role, password_hash, email_verified_at FROM users WHERE login_id = $1', [testLoginId]);
  assert.equal(storedUser.rows[0].role, 'user');
  assert.match(storedUser.rows[0].password_hash, /^scrypt\$/);
  assert.ok(storedUser.rows[0].email_verified_at);

  const duplicate = await publicClient.request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginId: testLoginId, email: `other-${testEmail}`, password: 'TestPass!2026', passwordConfirmation: 'TestPass!2026' }),
  });
  assert.equal(duplicate.response.status, 409);

  const wrongLogin = await publicClient.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginId: testLoginId, password: 'WrongPass!2026' }),
  });
  assert.equal(wrongLogin.response.status, 401);

  const userClient = createClient();
  const login = await userClient.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginId: testLoginId, password: 'TestPass!2026' }),
  });
  assert.equal(login.response.status, 200);
  assert.equal(login.body.data.user.role, 'user');
  assert.equal(login.body.data.redirectPath, '/dashboard');
  const firstSessionCookies = userClient.snapshot();
  assert.match(firstSessionCookies.get('mt_session'), /.+/);
  assert.match([...login.response.headers.getSetCookie()].find((cookie) => cookie.startsWith('mt_session=')), /HttpOnly/);

  const loginAgain = await userClient.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginId: testLoginId, password: 'TestPass!2026' }),
  });
  assert.equal(loginAgain.response.status, 200);
  const staleClient = createClient();
  staleClient.cookies = firstSessionCookies;
  const staleResult = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: [...firstSessionCookies].map(([name, value]) => `${name}=${value}`).join('; ') } });
  assert.equal(staleResult.status, 401);

  const me = await userClient.request('/api/auth/me');
  assert.equal(me.response.status, 200);
  assert.equal(me.body.data.user.role, 'user');

  const ownerDenied = await userClient.request('/api/owner/access-check');
  assert.equal(ownerDenied.response.status, 403);
  const userAllowed = await userClient.request('/api/user/access-check');
  assert.equal(userAllowed.response.status, 200);

  const csrfDenied = await userClient.request('/api/auth/logout', { method: 'POST' });
  assert.equal(csrfDenied.response.status, 403);
  const logout = await userClient.request('/api/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': userClient.csrf() } });
  assert.equal(logout.response.status, 204);
  const afterLogout = await userClient.request('/api/auth/me');
  assert.equal(afterLogout.response.status, 401);

  const resetClient = createClient();
  const resetLogin = await resetClient.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginId: testLoginId, password: 'TestPass!2026' }),
  });
  assert.equal(resetLogin.response.status, 200);
  const forgot = await publicClient.request('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail }),
  });
  assert.equal(forgot.response.status, 202);
  const resetEmail = getTestOutbox().find((item) => item.kind === 'reset' && item.to === testEmail);
  assert.ok(resetEmail?.token);

  const reset = await publicClient.request('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: resetEmail.token, password: 'ResetPass!2026', passwordConfirmation: 'ResetPass!2026' }),
  });
  assert.equal(reset.response.status, 200);
  const reusedReset = await publicClient.request('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: resetEmail.token, password: 'ResetPass!2026', passwordConfirmation: 'ResetPass!2026' }),
  });
  assert.equal(reusedReset.response.status, 400);
  const resetSessionEnded = await resetClient.request('/api/auth/me');
  assert.equal(resetSessionEnded.response.status, 401);

  const oldPassword = await publicClient.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginId: testLoginId, password: 'TestPass!2026' }),
  });
  assert.equal(oldPassword.response.status, 401);
  const newPassword = await publicClient.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginId: testLoginId, password: 'ResetPass!2026' }),
  });
  assert.equal(newPassword.response.status, 200);

  const expiredToken = createOpaqueToken();
  const userRow = await pool.query('SELECT id FROM users WHERE login_id = $1', [testLoginId]);
  await pool.query('INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() - INTERVAL \'1 minute\')', [userRow.rows[0].id, hashOpaqueToken(expiredToken)]);
  const expiredReset = await publicClient.request('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: expiredToken, password: 'ResetPass!2026', passwordConfirmation: 'ResetPass!2026' }),
  });
  assert.equal(expiredReset.response.status, 400);

  const inactiveClient = createClient();
  const inactiveLogin = await inactiveClient.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginId: testLoginId, password: 'ResetPass!2026' }),
  });
  assert.equal(inactiveLogin.response.status, 200);
  await pool.query('UPDATE users SET is_active = FALSE, deactivated_at = NOW() WHERE login_id = $1', [testLoginId]);
  const inactiveSession = await inactiveClient.request('/api/auth/me');
  assert.equal(inactiveSession.response.status, 401);
  await pool.query('UPDATE users SET is_active = TRUE, deactivated_at = NULL WHERE login_id = $1', [testLoginId]);

  const anonymous = createClient();
  assert.equal((await anonymous.request('/api/owner/access-check')).response.status, 401);
  assert.equal((await anonymous.request('/dashboard')).response.status, 401);

  const ownerClient = createClient();
  // Seed owner may not exist in isolated TEST DB; use any existing owner or create a temporary one.
  let ownerLogin = await ownerClient.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginId: 'owner-demo', password: 'OwnerDemo!2026' }),
  });
  let tempOwnerLoginId = null;
  if (ownerLogin.response.status !== 200) {
    tempOwnerLoginId = `auth-owner-${Date.now().toString(36)}`;
    const ownerHash = await hashPassword('OwnerDemo!2026');
    await pool.query(
      `INSERT INTO users (login_id, nickname, email, role, password_hash, is_active, email_verified_at)
       VALUES ($1, $2, NULL, 'owner', $3, TRUE, NOW())
       ON CONFLICT (login_id) DO NOTHING`,
      [tempOwnerLoginId, 'Auth Temp Owner', ownerHash],
    );
    ownerLogin = await ownerClient.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginId: tempOwnerLoginId, password: 'OwnerDemo!2026' }),
    });
  }
  assert.equal(ownerLogin.response.status, 200);
  assert.equal(ownerLogin.body.data.redirectPath, '/owner/dashboard');
  assert.equal((await ownerClient.request('/api/owner/access-check')).response.status, 200);
  assert.equal((await ownerClient.request('/api/user/access-check')).response.status, 403);
  if (tempOwnerLoginId) {
    await pool.query('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE login_id = $1)', [tempOwnerLoginId]);
    await pool.query('DELETE FROM users WHERE login_id = $1', [tempOwnerLoginId]);
  }

  const rateClient = createClient();
  const attempts = [];
  for (let index = 0; index < 13; index += 1) {
    attempts.push(await rateClient.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginId: 'unknown-rate-test', password: 'WrongPass!2026' }),
    }));
  }
  assert.ok(attempts.some(({ response }) => response.status === 429));
});
