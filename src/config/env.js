import dotenv from 'dotenv';

dotenv.config();

function parsePort(value) {
  const port = Number(value ?? 3000);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('PORT must be an integer between 1024 and 65535.');
  }
  return port;
}

function parseBoolean(value, fallback) {
  if (value === undefined) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('Boolean environment values must be true or false.');
}

function parseSameSite(value) {
  const sameSite = value ?? 'lax';
  if (!['lax', 'strict', 'none'].includes(sameSite)) {
    throw new Error('COOKIE_SAMESITE must be lax, strict, or none.');
  }
  return sameSite;
}

function parseEmailMode(value) {
  const mode = value ?? 'disabled';
  if (!['disabled', 'simulation', 'test', 'smtp'].includes(mode)) {
    throw new Error('EMAIL_MODE must be disabled, simulation, test, or smtp.');
  }
  return mode;
}

function parseAppBaseUrl(value) {
  const rawValue = value?.trim() || 'http://localhost:3000';
  try {
    const parsed = new URL(rawValue);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error('unsupported URL');
    }
    return parsed.toString().replace(/\/$/u, '');
  } catch {
    throw new Error('APP_BASE_URL must be an absolute HTTP(S) URL without credentials, query, or hash.');
  }
}

function requireDatabaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL is required.');

  try {
    const parsed = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
      throw new Error('unsupported protocol');
    }
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
  }

  return value;
}

function requireSessionSecret() {
  const value = process.env.SESSION_SECRET?.trim();
  if (!value || value.length < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 characters.');
  }
  return value;
}

function parseSmtpPort(value) {
  const port = Number(value ?? 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('SMTP_PORT must be an integer between 1 and 65535.');
  }
  return port;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const emailMode = parseEmailMode(process.env.EMAIL_MODE);
const appBaseUrl = parseAppBaseUrl(process.env.APP_BASE_URL);
const smtpHost = process.env.SMTP_HOST?.trim() ?? '';
const smtpUser = process.env.SMTP_USER?.trim() ?? '';
const smtpPassword = process.env.SMTP_PASSWORD?.trim() ?? '';
const emailFrom = process.env.EMAIL_FROM?.trim() ?? '';

if (emailMode === 'smtp' && (!smtpHost || !smtpUser || !smtpPassword || !emailFrom)) {
  throw new Error('EMAIL_MODE=smtp requires SMTP_HOST, SMTP_USER, SMTP_PASSWORD, and EMAIL_FROM.');
}
if (emailMode === 'smtp' && nodeEnv === 'production' && !appBaseUrl.startsWith('https://')) {
  throw new Error('APP_BASE_URL must use HTTPS when EMAIL_MODE=smtp in production.');
}

export const env = Object.freeze({
  nodeEnv,
  port: parsePort(process.env.PORT),
  databaseUrl: requireDatabaseUrl(),
  sessionSecret: requireSessionSecret(),
  cookieSecure: parseBoolean(process.env.COOKIE_SECURE, false),
  cookieSameSite: parseSameSite(process.env.COOKIE_SAMESITE),
  sessionTtlMs: 8 * 60 * 60 * 1000,
  emailMode,
  emailFrom,
  appBaseUrl,
  smtpHost,
  smtpPort: parseSmtpPort(process.env.SMTP_PORT),
  smtpUser,
  smtpPassword,
});
