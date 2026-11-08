import { test, expect } from '@playwright/test';
import { login } from './helpers/auth.js';

test.describe('Access control and owner dashboard (isolated test DB)', () => {
  test('User cannot access owner dashboard (role isolation)', async ({ page }) => {
    const loginId = process.env.E2E_USER_LOGIN_ID;
    const password = process.env.E2E_USER_PASSWORD;
    test.skip(!loginId || !password, 'E2E_USER_LOGIN_ID/PASSWORD not set');
    await login(page, { loginId, password });
    await page.waitForURL(/\/dashboard/);
    const resp = await page.goto('/owner/dashboard');
    // Server should deny; app may return 401/403 or redirect depending on implementation.
    expect([401, 403]).toContain(resp?.status() ?? 0);
  });

  test('Owner dashboard loads stats and user management controls', async ({ page }) => {
    const loginId = process.env.E2E_OWNER_LOGIN_ID;
    const password = process.env.E2E_OWNER_PASSWORD;
    test.skip(!loginId || !password, 'E2E_OWNER_LOGIN_ID/PASSWORD not set');
    await login(page, { loginId, password });
    await page.waitForURL(/\/owner\/dashboard/);
    await expect(page.locator('[data-user-label]')).toContainText(/Owner/i);
    await expect(page.locator('[data-stats]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-user-search]')).toBeVisible();
    await expect(page.locator('[data-user-status]')).toBeVisible();
  });

  test('Owner can open user detail dialog (read action)', async ({ page }) => {
    const loginId = process.env.E2E_OWNER_LOGIN_ID;
    const password = process.env.E2E_OWNER_PASSWORD;
    test.skip(!loginId || !password, 'E2E_OWNER_LOGIN_ID/PASSWORD not set');
    await login(page, { loginId, password });
    await page.waitForURL(/\/owner\/dashboard/);
    await expect(page.locator('[data-user-list]')).toBeVisible({ timeout: 15000 });
    const detailBtn = page.locator('[data-user-list] button[data-action="detail"]').first();
    test.skip(!(await detailBtn.count()), 'No users listed in isolated test DB');
    await detailBtn.click();
    await expect(page.locator('[data-user-dialog]')).toBeVisible();
    await page.locator('[data-close-detail]').click();
  });

  test('Owner toggle user status (MUTATING - isolated test DB only)', async ({ page }) => {
    const loginId = process.env.E2E_OWNER_LOGIN_ID;
    const password = process.env.E2E_OWNER_PASSWORD;
    const targetLogin = process.env.E2E_USER_LOGIN_ID; // do not toggle owner; guard via test data
    test.skip(!loginId || !password || !targetLogin, 'E2E owner/user credentials not set');
    await login(page, { loginId, password });
    await page.waitForURL(/\/owner\/dashboard/);

    const targetRow = async () => {
      await page.locator('[data-user-search]').fill(targetLogin);
      await page.waitForTimeout(500);
      const row = page.locator('[data-user-list] [data-user-id]').first();
      return row;
    };
    const statusBtnOf = (row) => row.locator('button[data-action="status"]');
    const ensureActive = async () => {
      const row = await targetRow();
      test.skip(!(await row.count()), 'Target user not found');
      const btn = statusBtnOf(row);
      const text = ((await btn.textContent()) || '').trim();
      if (/aktifkan/i.test(text) && !/nonaktifkan/i.test(text)) {
        // currently inactive -> activate
        page.once('dialog', (d) => d.accept());
        await btn.click();
        await expect(page.locator('[data-feedback]')).toBeVisible({ timeout: 15000 });
      }
      // verify ends active (button becomes "Nonaktifkan")
      const row2 = await targetRow();
      await expect(statusBtnOf(row2)).toContainText(/Nonaktifkan/i, { timeout: 15000 });
    };

    await ensureActive(); // normalize starting state (protects shared TEST DB)

    // Toggle: active -> inactive
    let row = await targetRow();
    const deactivateBtn = statusBtnOf(row);
    await expect(deactivateBtn).toContainText(/Nonaktifkan/i);
    page.once('dialog', (d) => d.accept());
    await deactivateBtn.click();
    await expect(page.locator('[data-feedback]')).toBeVisible({ timeout: 15000 });
    row = await targetRow();
    await expect(statusBtnOf(row)).toContainText(/^Aktifkan$/i, { timeout: 15000 });

    // Toggle back: inactive -> active (must restore E2E account state)
    page.once('dialog', (d) => d.accept());
    await statusBtnOf(row).click();
    await expect(page.locator('[data-feedback]')).toBeVisible({ timeout: 15000 });
    row = await targetRow();
    await expect(statusBtnOf(row)).toContainText(/Nonaktifkan/i, { timeout: 15000 });
  });
});
