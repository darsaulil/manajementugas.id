import { Router } from 'express';

import { requireAuth, requireCsrf } from '../auth/middleware.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { createOpaqueToken, expiresFromNow, hashOpaqueToken } from '../auth/tokens.js';
import { readCookie, createSession, SESSION_COOKIE } from '../auth/session.js';
import { nicknameTaken, normalizeNickname, validateNickname } from '../auth/nickname.js';
import { validateEmail, normalizeEmail, validatePasswordInput } from '../auth/validation.js';
import { pool } from '../db/pool.js';
import { HttpError } from '../http/errors.js';
import { sendAuthEmail } from '../services/email.js';

const router = Router();
const verificationTtlMs = 24 * 60 * 60 * 1000;
router.use(requireAuth);

function validationFailure(details) {
  return new HttpError(422, 'VALIDATION_ERROR', 'Periksa kembali data pengaturan akun.', details);
}

function accountUser(row) {
  return {
    id: row.id,
    loginId: row.login_id,
    nickname: row.nickname,
    email: row.email,
    role: row.role,
    isActive: Boolean(row.is_active),
    emailVerified: Boolean(row.email_verified_at),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
  };
}

router.get('/me', async (request, response, next) => {
  try {
    const result = await pool.query(`
      SELECT id, login_id, nickname, email, role, is_active, email_verified_at, created_at, updated_at
      FROM users
      WHERE id = $1
    `, [request.auth.userId]);
    if (!result.rows[0]) throw new HttpError(404, 'ACCOUNT_NOT_FOUND', 'Akun tidak ditemukan.');
    response.status(200).json({ data: { user: accountUser(result.rows[0]) } });
  } catch (error) {
    next(error);
  }
});

router.post('/nickname', requireCsrf, async (request, response, next) => {
  try {
    const nickname = normalizeNickname(request.body?.nickname);
    const nicknameError = validateNickname(nickname);
    if (nicknameError) throw validationFailure({ nickname: nicknameError });

    const userResult = await pool.query('SELECT id, is_active FROM users WHERE id = $1', [request.auth.userId]);
    const user = userResult.rows[0];
    if (!user || !user.is_active) throw new HttpError(401, 'ACCOUNT_INACTIVE', 'Akun sedang tidak aktif.');
    if (await nicknameTaken(pool, nickname, user.id)) {
      throw new HttpError(409, 'NICKNAME_TAKEN', 'Nickname sudah digunakan atau berbenturan dengan ID akun lain.');
    }

    const updated = await pool.query(`
      UPDATE users
      SET nickname = $1
      WHERE id = $2
      RETURNING id, login_id, nickname, email, role, is_active, email_verified_at, created_at, updated_at
    `, [nickname, user.id]);
    response.status(200).json({ data: { user: accountUser(updated.rows[0]), nicknameChanged: true } });
  } catch (error) {
    next(error);
  }
});

router.post('/password', requireCsrf, async (request, response, next) => {
  try {
    const currentPassword = String(request.body?.currentPassword ?? '');
    const input = validatePasswordInput(request.body ?? {});
    const errors = { ...input.errors };
    if (!currentPassword) errors.currentPassword = 'Password saat ini wajib diisi.';
    if (Object.keys(errors).length > 0) throw validationFailure(errors);

    const userResult = await pool.query('SELECT password_hash FROM users WHERE id = $1 AND is_active = TRUE', [request.auth.userId]);
    const user = userResult.rows[0];
    if (!user || !(await verifyPassword(currentPassword, user.password_hash))) {
      throw new HttpError(401, 'CURRENT_PASSWORD_INVALID', 'Password saat ini tidak valid.');
    }

    const passwordHash = await hashPassword(input.password);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, request.auth.userId]);
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [request.auth.userId]);
    await createSession(response, request.auth.userId, readCookie(request, SESSION_COOKIE));
    response.status(200).json({ data: { passwordChanged: true, sessionsRotated: true } });
  } catch (error) {
    next(error);
  }
});

router.post('/email', requireCsrf, async (request, response, next) => {
  try {
    const newEmail = normalizeEmail(request.body?.newEmail);
    const currentPassword = String(request.body?.currentPassword ?? '');
    const emailError = validateEmail(newEmail);
    const errors = {};
    if (emailError) errors.newEmail = emailError;
    if (!currentPassword) errors.currentPassword = 'Password saat ini wajib diisi.';
    if (Object.keys(errors).length > 0) throw validationFailure(errors);

    const userResult = await pool.query('SELECT id, email, password_hash, is_active FROM users WHERE id = $1', [request.auth.userId]);
    const user = userResult.rows[0];
    if (!user || !user.is_active) throw new HttpError(401, 'ACCOUNT_INACTIVE', 'Akun sedang tidak aktif.');
    if (!(await verifyPassword(currentPassword, user.password_hash))) {
      throw new HttpError(401, 'CURRENT_PASSWORD_INVALID', 'Password saat ini tidak valid.');
    }
    const existingEmail = user.email ? normalizeEmail(user.email) : '';
    if (existingEmail && newEmail === existingEmail) {
      throw new HttpError(422, 'EMAIL_UNCHANGED', 'Gunakan email baru yang berbeda.');
    }

    const token = createOpaqueToken();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        UPDATE users
        SET email = $1, email_verified_at = NULL
        WHERE id = $2
      `, [newEmail, user.id]);
      await client.query(`
        UPDATE email_verification_tokens
        SET used_at = COALESCE(used_at, NOW())
        WHERE user_id = $1 AND used_at IS NULL
      `, [user.id]);
      await client.query(`
        INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
        VALUES ($1, $2, $3)
      `, [user.id, hashOpaqueToken(token), expiresFromNow(verificationTtlMs)]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    let emailDelivery = 'provider_error';
    try {
      emailDelivery = (await sendAuthEmail({ kind: 'verification', to: newEmail, token })).status;
    } catch {
      emailDelivery = 'provider_error';
    }
    response.status(202).json({
      data: {
        email: newEmail,
        emailVerified: false,
        verificationRequired: true,
        emailDelivery,
      },
    });
  } catch (error) {
    next(error);
  }
});

export { router as accountRouter };
