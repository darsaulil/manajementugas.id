import { createHash, createHmac, randomBytes } from 'node:crypto';
import { parseCookie, stringifySetCookie } from 'cookie';

import { env } from '../config/env.js';
import { pool } from '../db/pool.js';

export const SESSION_COOKIE = 'mt_session';
export const CSRF_COOKIE = 'mt_csrf';

function sessionHash(rawToken) {
  return createHash('sha256').update(rawToken).digest('hex');
}

export function deriveCsrfToken(rawSessionToken) {
  return createHmac('sha256', env.sessionSecret).update(rawSessionToken).digest('base64url');
}

function cookieOptions({ httpOnly, maxAge }) {
  return {
    httpOnly,
    maxAge: Math.max(0, Math.floor(maxAge / 1000)),
    path: '/',
    sameSite: env.cookieSameSite,
    secure: env.cookieSecure,
  };
}

function setCookie(response, name, value, options) {
  response.append('Set-Cookie', [stringifySetCookie({ name, value, ...cookieOptions(options) })]);
}

export function readCookie(request, name) {
  return parseCookie(request.headers.cookie ?? '')[name] ?? null;
}

export function clearSessionCookies(response) {
  setCookie(response, SESSION_COOKIE, '', { httpOnly: true, maxAge: 0 });
  setCookie(response, CSRF_COOKIE, '', { httpOnly: false, maxAge: 0 });
}

async function deleteSessionByRawToken(rawToken) {
  if (!rawToken) return;
  await pool.query('DELETE FROM sessions WHERE session_id_hash = $1', [sessionHash(rawToken)]);
}

export async function createSession(response, userId, previousRawToken = null) {
  await deleteSessionByRawToken(previousRawToken);

  const rawSessionToken = randomBytes(32).toString('base64url');
  const rawCsrfToken = deriveCsrfToken(rawSessionToken);
  const expiresAt = new Date(Date.now() + env.sessionTtlMs);

  await pool.query(`
    INSERT INTO sessions (session_id_hash, user_id, expires_at, last_seen_at)
    VALUES ($1, $2, $3, NOW())
  `, [sessionHash(rawSessionToken), userId, expiresAt]);

  setCookie(response, SESSION_COOKIE, rawSessionToken, { httpOnly: true, maxAge: env.sessionTtlMs });
  setCookie(response, CSRF_COOKIE, rawCsrfToken, { httpOnly: false, maxAge: env.sessionTtlMs });
  return { expiresAt };
}

export async function loadSession(request, response) {
  const rawSessionToken = readCookie(request, SESSION_COOKIE);
  if (!rawSessionToken) return null;

  const result = await pool.query(`
    SELECT s.session_id_hash, s.user_id, s.expires_at, u.login_id, u.nickname, u.email, u.role, u.is_active, u.email_verified_at
    FROM sessions s
    INNER JOIN users u ON u.id = s.user_id
    WHERE s.session_id_hash = $1
      AND s.expires_at > NOW()
  `, [sessionHash(rawSessionToken)]);

  const session = result.rows[0];
  if (!session || !session.is_active) {
    await deleteSessionByRawToken(rawSessionToken);
    clearSessionCookies(response);
    return null;
  }

  await pool.query('UPDATE sessions SET last_seen_at = NOW() WHERE session_id_hash = $1', [session.session_id_hash]);
  request.auth = {
    sessionIdHash: session.session_id_hash,
    userId: session.user_id,
    loginId: session.login_id,
    nickname: session.nickname,
    email: session.email,
    role: session.role,
    emailVerifiedAt: session.email_verified_at,
    rawSessionToken,
  };
  return request.auth;
}

export async function destroySession(request, response) {
  const rawSessionToken = readCookie(request, SESSION_COOKIE);
  await deleteSessionByRawToken(rawSessionToken);
  clearSessionCookies(response);
}

export function isValidCsrf(request) {
  const rawSessionToken = readCookie(request, SESSION_COOKIE);
  const cookieToken = readCookie(request, CSRF_COOKIE);
  const headerToken = request.get('x-csrf-token');
  if (!rawSessionToken || !cookieToken || !headerToken) return false;
  return cookieToken === headerToken && cookieToken === deriveCsrfToken(rawSessionToken);
}
