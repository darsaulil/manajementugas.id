import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { pool } from '../db/pool.js';
import { HttpError } from '../http/errors.js';
import { sendAuthEmail } from '../services/email.js';
import { createAvailableNickname } from './nickname.js';
import { requireCsrf } from './middleware.js';
import { hashPassword, verifyPassword } from './password.js';
import { createOpaqueToken, expiresFromNow, hashOpaqueToken } from './tokens.js';
import { createSession, destroySession, readCookie, CSRF_COOKIE, SESSION_COOKIE } from './session.js';
import { validatePasswordInput, validateRegistrationInput } from './validation.js';

const router = Router();
const verificationTtlMs = 24 * 60 * 60 * 1000;
const resetTtlMs = 60 * 60 * 1000;

function authRateLimit(message, limit) {
  // E2E runs many sequential logins/registrations across headed projects against an isolated test DB.
  // Keep production limits intact; relax only in explicit test mode.
  const effectiveLimit = process.env.NODE_ENV === 'test' ? Math.max(limit, 10_000) : limit;
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: effectiveLimit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (request, response) => response.status(429).json({
      error: { code: 'RATE_LIMITED', message },
    }),
  });
}

const loginLimiter = authRateLimit('Terlalu banyak percobaan. Silakan coba lagi nanti.', 12);
const registrationLimiter = authRateLimit('Terlalu banyak percobaan registrasi. Silakan coba lagi nanti.', 8);
const recoveryLimiter = authRateLimit('Terlalu banyak permintaan pemulihan. Silakan coba lagi nanti.', 8);

function validationFailure(errors) {
  return new HttpError(422, 'VALIDATION_ERROR', 'Periksa kembali data yang dikirim.', errors);
}

function publicUser(user) {
  return {
    loginId: user.login_id,
    nickname: user.nickname,
    email: user.email,
    role: user.role,
    emailVerified: Boolean(user.email_verified_at),
  };
}

async function issueVerificationToken(userId, email) {
  const token = createOpaqueToken();
  await pool.query(`
    INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
    VALUES ($1, $2, $3)
  `, [userId, hashOpaqueToken(token), expiresFromNow(verificationTtlMs)]);
  try {
    return await sendAuthEmail({ kind: 'verification', to: email, token });
  } catch {
    return { status: 'provider_error' };
  }
}

async function issueResetToken(userId, email) {
  const token = createOpaqueToken();
  await pool.query(`
    UPDATE password_reset_tokens
    SET used_at = NOW()
    WHERE user_id = $1 AND used_at IS NULL
  `, [userId]);
  await pool.query(`
    INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
    VALUES ($1, $2, $3)
  `, [userId, hashOpaqueToken(token), expiresFromNow(resetTtlMs)]);
  try {
    return await sendAuthEmail({ kind: 'reset', to: email, token });
  } catch {
    return { status: 'provider_error' };
  }
}

router.get('/csrf', (request, response) => {
  response.status(200).json({ data: { csrfToken: request.auth ? readCookie(request, CSRF_COOKIE) : null } });
});

router.post('/register', registrationLimiter, async (request, response, next) => {
  try {
    const input = validateRegistrationInput(request.body ?? {});
    if (Object.keys(input.errors).length > 0) {
      throw validationFailure(input.errors);
    }

    const passwordHash = await hashPassword(input.password);
    const client = await pool.connect();
    let user;

    try {
      await client.query('BEGIN');

      const nickname = await createAvailableNickname(client, input.loginId);

      const inserted = await client.query(`
        INSERT INTO users (
          login_id,
          nickname,
          email,
          role,
          password_hash,
          is_active,
          email_verified_at
        )
        VALUES ($1, $2, $3, 'user', $4, TRUE, NOW())
        RETURNING id, login_id, nickname, email, role, email_verified_at
      `, [
        input.loginId,
        nickname,
        input.email,
        passwordHash,
      ]);

      user = inserted.rows[0];

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    await createSession(response, user.id, readCookie(request, SESSION_COOKIE));
    response.status(201).json({
      data: {
        user: publicUser(user),
        verificationRequired: false,
        message: 'Registrasi berhasil.',
        redirectPath: '/dashboard',
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/login', loginLimiter, async (request, response, next) => {
  try {
    const loginId = String(request.body?.loginId ?? '').trim().toLowerCase();
    const password = String(request.body?.password ?? '');
    if (!loginId || !password) throw validationFailure({ form: 'ID dan password wajib diisi.' });

    const result = await pool.query(`
      SELECT id, login_id, nickname, email, role, password_hash, is_active, email_verified_at
      FROM users
      WHERE login_id = $1
    `, [loginId]);
    const user = result.rows[0];
    const validPassword = user ? await verifyPassword(password, user.password_hash) : false;

    if (!user || !validPassword) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'ID atau password tidak valid.');
    }
    if (!user.is_active) {
      throw new HttpError(403, 'ACCOUNT_INACTIVE', 'Akun sedang tidak aktif.');
    }
    

    await createSession(response, user.id, readCookie(request, SESSION_COOKIE));
    response.status(200).json({
      data: {
        user: publicUser(user),
        redirectPath: user.role === 'owner' ? '/owner/dashboard' : '/dashboard',
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/me', (request, response, next) => {
  if (!request.auth) {
    next(new HttpError(401, 'AUTH_REQUIRED', 'Sesi login diperlukan.'));
    return;
  }
  response.status(200).json({
    data: {
      user: {
        loginId: request.auth.loginId,
        nickname: request.auth.nickname,
        email: request.auth.email,
        role: request.auth.role,
        emailVerified: Boolean(request.auth.emailVerifiedAt),
      },
    },
  });
});

router.post('/logout', (request, response, next) => {
  if (!request.auth) {
    destroySession(request, response).then(() => response.status(204).end()).catch(next);
    return;
  }
  requireCsrf(request, response, async (error) => {
    if (error) {
      next(error);
      return;
    }
    try {
      await destroySession(request, response);
      response.status(204).end();
    } catch (logoutError) {
      next(logoutError);
    }
  });
});

router.get('/verify-email', async (request, response, next) => {
  try {
    const token = String(request.query?.token ?? '');
    if (token.length < 20) throw new HttpError(400, 'VERIFICATION_TOKEN_INVALID', 'Token verifikasi tidak valid atau sudah kedaluwarsa.');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const tokenResult = await client.query(`
        SELECT id, user_id
        FROM email_verification_tokens
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
        FOR UPDATE
      `, [hashOpaqueToken(token)]);
      const tokenRow = tokenResult.rows[0];
      if (!tokenRow) throw new HttpError(400, 'VERIFICATION_TOKEN_INVALID', 'Token verifikasi tidak valid atau sudah kedaluwarsa.');

      await client.query('UPDATE email_verification_tokens SET used_at = NOW() WHERE id = $1', [tokenRow.id]);
      await client.query('UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = $1', [tokenRow.user_id]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    response.status(200).json({ data: { verified: true } });
  } catch (error) {
    next(error);
  }
});

router.post('/forgot-password', recoveryLimiter, async (request, response, next) => {
  try {
    const email = String(request.body?.email ?? '').trim().toLowerCase();
    if (!email) throw validationFailure({ email: 'Email wajib diisi.' });

    const userResult = await pool.query('SELECT id, email, is_active FROM users WHERE LOWER(email) = $1', [email]);
    const user = userResult.rows[0];
    if (user?.is_active) {
      await issueResetToken(user.id, user.email);
    }

    response.status(202).json({ data: { message: 'Jika akun sesuai, instruksi pemulihan akan diproses.' } });
  } catch (error) {
    next(error);
  }
});

router.post('/reset-password', recoveryLimiter, async (request, response, next) => {
  try {
    const token = String(request.body?.token ?? '');
    const input = validatePasswordInput(request.body ?? {});
    if (token.length < 20 || Object.keys(input.errors).length > 0) {
      throw new HttpError(400, 'RESET_TOKEN_INVALID', 'Token atau password reset tidak valid.');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const tokenResult = await client.query(`
        SELECT id, user_id
        FROM password_reset_tokens
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
        FOR UPDATE
      `, [hashOpaqueToken(token)]);
      const tokenRow = tokenResult.rows[0];
      if (!tokenRow) throw new HttpError(400, 'RESET_TOKEN_INVALID', 'Token atau password reset tidak valid.');

      const passwordHash = await hashPassword(input.password);
      await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, tokenRow.user_id]);
      await client.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [tokenRow.id]);
      await client.query('DELETE FROM sessions WHERE user_id = $1', [tokenRow.user_id]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    await destroySession(request, response);
    response.status(200).json({ data: { passwordReset: true } });
  } catch (error) {
    next(error);
  }
});

export { router as authRouter };
