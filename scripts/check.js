import { spawnSync } from 'node:child_process';

const files = [
  'src/config/env.js',
  'src/db/pool.js',
  'src/db/health.js',
  'src/http/errors.js',
  'src/app.js',
  'src/server.js',
  'src/auth/password.js',
  'src/auth/tokens.js',
  'src/auth/nickname.js',
  'src/auth/session.js',
  'src/auth/middleware.js',
  'src/auth/validation.js',
  'src/auth/routes.js',
  'src/account/routes.js',
  'src/owner/service.js',
  'src/owner/routes.js',
  'src/reports/service.js',
  'src/reports/routes.js',
  'src/tasks/validation.js',
  'src/tasks/service.js',
  'src/tasks/routes.js',
  'src/services/email.js',
  'public/app.js',
  'public/auth/auth.js',
  'public/dashboard-nav.js',
  'public/tasks.js',
  'public/owner.js',
  'public/reports.js',
  'public/settings.js',
  'scripts/db-migrate.js',
  'scripts/db-seed.js',
  'scripts/run-tests.js',
  'scripts/check.js',
  'tests/auth.integration.test.js',
  'tests/database.integration.test.js',
  'tests/foundation.test.js',
  'tests/tasks.integration.test.js',
  'tests/stage46.integration.test.js',
  'playwright.config.js',
  'tests/e2e/helpers/db-guard.js',
  'tests/e2e/helpers/auth.js',
  'tests/e2e/public-auth.spec.js',
  'tests/e2e/tasks.spec.js',
  'tests/e2e/owner-access.spec.js',
  'tests/e2e/reports-settings-responsive.spec.js',
  'tests/e2e/master.spec.js',
  'tests/e2e/finalization.spec.js',
];

let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0 || result.error) {
    if (result.error) console.error(result.error.message);
    console.error(`CHECK FAIL: ${file}`);
    process.exit(typeof result.status === 'number' ? result.status : 1);
  }
}
console.log(`CHECK PASS: ${files.length} files`);
