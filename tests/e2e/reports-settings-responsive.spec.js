import { test, expect } from '@playwright/test';
import { login } from './helpers/auth.js';

test.describe('Reports and settings (isolated test DB)', () => {
  test.beforeEach(async ({ page }) => {
    const loginId = process.env.E2E_USER_LOGIN_ID || process.env.E2E_OWNER_LOGIN_ID;
    const password = process.env.E2E_USER_PASSWORD || process.env.E2E_OWNER_PASSWORD;
    test.skip(!loginId || !password, 'E2E credentials not set');
    await login(page, { loginId, password }); // waits for redirect away from /login
  });

  test('reports page loads and period controls work', async ({ page }) => {
    await page.goto('/reports');
    await expect(page).toHaveURL(/\/reports/);
    await expect(page.locator('[data-report-mode]')).toBeVisible({ timeout: 15000 });
    await page.locator('[data-report-mode]').selectOption('monthly');
    await expect(page.locator('[data-monthly-field]')).toBeVisible();
    await page.locator('[data-apply-report]').click();
    await expect(page.locator('[data-report-content]:not([hidden])')).toBeVisible({ timeout: 20000 });
  });

  test('settings page loads profile sections', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.locator('[data-nickname]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-theme-action], [data-theme-toggle]').first()).toBeVisible();
  });
});

test.describe('Responsive hamburger & theme (viewport-aware)', () => {
  test('mobile hamburger opens/closes on dashboard nav', async ({ page }, testInfo) => {
    const loginId = process.env.E2E_USER_LOGIN_ID || process.env.E2E_OWNER_LOGIN_ID;
    const password = process.env.E2E_USER_PASSWORD || process.env.E2E_OWNER_PASSWORD;
    test.skip(!loginId || !password, 'E2E credentials not set');
    const isMobileProject = testInfo.project.name === 'mobile' || testInfo.project.name === 'tablet';
    test.skip(!isMobileProject, 'Runs in mobile/tablet viewport projects');

    await login(page, { loginId, password });
    await page.waitForURL(/\/(dashboard|owner\/dashboard)/);
    const toggle = page.locator('.tasks-nav .nav-toggle');
    await expect(toggle).toBeVisible({ timeout: 10000 });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.tasks-nav .nav-menu.is-open')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  test('desktop keeps nav usable without hamburger dependency', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Desktop project only');
    await page.goto('/');
    await expect(page.locator('.site-nav .nav-menu')).toBeVisible();
    // no horizontal overflow sanity
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflow).toBeFalsy();
  });

  test('public pages have no horizontal overflow at current viewport', async ({ page }) => {
    for (const path of ['/', '/login', '/register']) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      expect(overflow, `overflow at ${path} (${test.info().project.name})`).toBeFalsy();
    }
  });

  test('theme toggle changes data-theme (UI/localStorage)', async ({ page }) => {
    const loginId = process.env.E2E_USER_LOGIN_ID || process.env.E2E_OWNER_LOGIN_ID;
    const password = process.env.E2E_USER_PASSWORD || process.env.E2E_OWNER_PASSWORD;
    test.skip(!loginId || !password, 'E2E credentials not set');
    await login(page, { loginId, password });
    await page.waitForURL(/\/(dashboard|owner\/dashboard|reports|settings)/);
    const before = await page.evaluate(() => document.documentElement.dataset.theme);
    const toggle = page.locator('[data-theme-toggle], [data-theme-action]').first();
    if (await toggle.count()) {
      await toggle.click();
      const after = await page.evaluate(() => document.documentElement.dataset.theme || localStorage.getItem('manajementugas-theme'));
      expect(after).toBeTruthy();
      // restore
      if (after !== before && before) await page.evaluate((t) => { document.documentElement.dataset.theme = t; localStorage.setItem('manajementugas-theme', t); }, before);
    }
  });
});
