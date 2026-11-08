import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';
import { assertIsolatedTestDatabase, getSafeServerEnv } from './tests/e2e/helpers/db-guard.js';

// SAFETY: refuse to configure E2E if the isolated test DB is not confirmed.
// This runs at config load time to prevent accidental execution against the main DB.
assertIsolatedTestDatabase(process.env);
const serverEnv = getSafeServerEnv(process.env);
const port = serverEnv.PORT || '3100';
const baseURL = serverEnv.APP_BASE_URL || `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // safer for shared test-DB state; can tune later
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL,
    headless: false, // disetujui: headed mode, Chromium terlihat
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'node src/server.js',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: serverEnv,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'tablet',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } },
    },
    {
      name: 'mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
});
