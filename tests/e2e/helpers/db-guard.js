/**
 * DB safety guard for E2E/mutating operations.
 * - Never prints credential values.
 * - Refuses if TEST_DATABASE_URL is missing or equals DATABASE_URL.
 */
export function assertIsolatedTestDatabase(env = process.env) {
  const testUrl = (env.TEST_DATABASE_URL ?? '').trim();
  const mainUrl = (env.DATABASE_URL ?? '').trim();

  if (!testUrl) {
    throw new Error(
      'SAFETY GUARD: TEST_DATABASE_URL is not set. E2E/mutating DB operations are blocked.',
    );
  }
  if (!mainUrl) {
    throw new Error(
      'SAFETY GUARD: DATABASE_URL is not set; cannot verify isolation. Operations blocked.',
    );
  }
  if (testUrl === mainUrl) {
    throw new Error(
      'SAFETY GUARD: TEST_DATABASE_URL equals DATABASE_URL. Refusing to run against the main database.',
    );
  }

  try {
    const mu = new URL(mainUrl);
    const tu = new URL(testUrl);
    const hostDiff = mu.hostname !== tu.hostname;
    const dbDiff = mu.pathname !== tu.pathname;
    if (!hostDiff && !dbDiff) {
      throw new Error(
        'SAFETY GUARD: TEST_DATABASE_URL does not appear isolated (same host and database path). Operations blocked.',
      );
    }
  } catch (e) {
    if (e.message.startsWith('SAFETY GUARD')) throw e;
    // If parsing fails but values differ, allow but be explicit.
  }

  return true;
}

export function getSafeServerEnv(baseEnv = process.env) {
  assertIsolatedTestDatabase(baseEnv);
  const port = baseEnv.E2E_PORT || '3100';
  return {
    ...baseEnv,
    // Point the app at the isolated test DB only.
    DATABASE_URL: baseEnv.TEST_DATABASE_URL,
    PORT: port,
    APP_BASE_URL: baseEnv.E2E_APP_BASE_URL || `http://127.0.0.1:${port}`,
    NODE_ENV: 'test',
    EMAIL_MODE: 'test',
    COOKIE_SECURE: 'false',
    // Prevent accidental seeding against wrong target via app logic guards if any.
    SEED_ENABLED: baseEnv.E2E_SEED_ENABLED || 'false',
  };
}
