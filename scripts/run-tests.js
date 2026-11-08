import 'dotenv/config';
import { spawn } from 'node:child_process';

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim() ?? '';
const mainDatabaseUrl = process.env.DATABASE_URL?.trim() ?? '';
const isolatedDatabase = Boolean(testDatabaseUrl && mainDatabaseUrl && testDatabaseUrl !== mainDatabaseUrl);

const environment = {
  ...process.env,
  ALLOW_MUTATING_TESTS: isolatedDatabase ? 'true' : 'false',
  ISOLATED_TEST_DATABASE: isolatedDatabase ? 'true' : 'false',
};

if (isolatedDatabase) {
  environment.DATABASE_URL = testDatabaseUrl;
} else {
  console.log('Mutating integration tests are skipped: set TEST_DATABASE_URL to a separate database.');
}

environment.EMAIL_MODE = 'test';

const testFiles = [
  'tests/foundation.test.js',
  'tests/database.integration.test.js',
  'tests/auth.integration.test.js',
  'tests/tasks.integration.test.js',
  'tests/stage46.integration.test.js',
];

const child = spawn(process.execPath, ['--test', ...testFiles], {
  env: environment,
  stdio: 'inherit',
});

child.on('error', (error) => {
  console.error('Test runner failed to start.');
  console.error(error.message);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`Test runner stopped by ${signal}.`);
    process.exitCode = 1;
  } else {
    process.exitCode = code ?? 1;
  }
});
