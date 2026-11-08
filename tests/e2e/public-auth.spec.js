import { test, expect } from '@playwright/test';
import { login, uniqueId } from './helpers/auth.js';

test.describe('Public pages & auth flows', () => {
  test('landing page loads and primary navigation is visible', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/ManajemenTugas/i);
    await expect(page.getByRole('link', { name: /Login/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Daftar/i }).first()).toBeVisible();
  });

  test('registration without email auto-logins and redirects to user dashboard', async ({ page }) => {
    const id = uniqueId('nouser');
    await page.goto('/register');
    await page.locator('[data-auth-form="register"] input[name="loginId"]').fill(id);
    await page.locator('[data-auth-form="register"] input[name="email"]').fill('');
    await page.locator('[data-auth-form="register"] input[name="password"]').fill('E2eTest!2026x');
    await page.locator('[data-auth-form="register"] input[name="passwordConfirmation"]').fill('E2eTest!2026x');
    await page.locator('[data-auth-form="register"] button[type="submit"]').click();
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
    await expect(page.locator('[data-user-label]')).toContainText(id);
  });

  test('registration with email auto-logins and redirects to user dashboard', async ({ page }) => {
    const id = uniqueId('emuser');
    await page.goto('/register');
    await page.locator('[data-auth-form="register"] input[name="loginId"]').fill(id);
    await page.locator('[data-auth-form="register"] input[name="email"]').fill(`${id}@example.test`);
    await page.locator('[data-auth-form="register"] input[name="password"]').fill('E2eTest!2026x');
    await page.locator('[data-auth-form="register"] input[name="passwordConfirmation"]').fill('E2eTest!2026x');
    await page.locator('[data-auth-form="register"] button[type="submit"]').click();
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
    await expect(page.locator('[data-user-label]')).toContainText(id);
  });

  test('login validation shows field-level error details', async ({ page }) => {
    await page.goto('/login');
    await page.locator('[data-auth-form="login"] button[type="submit"]').click();
    // HTML required may block; fill invalid combo via script-friendly path
    await page.locator('[data-auth-form="login"] input[name="loginId"]').fill('nouser');
    await page.locator('[data-auth-form="login"] input[name="password"]').fill('wrong');
    await page.locator('[data-auth-form="login"] button[type="submit"]').click();
    await expect(page.locator('[data-auth-message]')).toBeVisible();
  });
});

test.describe('Login/logout with seeded accounts (isolated test DB)', () => {
  test('User login -> dashboard -> logout', async ({ page }) => {
    const loginId = process.env.E2E_USER_LOGIN_ID;
    const password = process.env.E2E_USER_PASSWORD;
    test.skip(!loginId || !password, 'E2E_USER_LOGIN_ID/PASSWORD not set (requires seeded isolated test DB)');
    await login(page, { loginId, password });
    await page.waitForURL(/\/dashboard/);
    await expect(page.locator('[data-user-label]')).toContainText(loginId);
    await page.locator('[data-logout]').click();
    await page.waitForURL(/\/(login)?$/);
  });

  test('Owner login -> owner dashboard -> logout', async ({ page }) => {
    const loginId = process.env.E2E_OWNER_LOGIN_ID;
    const password = process.env.E2E_OWNER_PASSWORD;
    test.skip(!loginId || !password, 'E2E_OWNER_LOGIN_ID/PASSWORD not set (requires seeded isolated test DB)');
    await login(page, { loginId, password });
    await page.waitForURL(/\/owner\/dashboard/);
    await expect(page.locator('[data-user-label]')).toContainText(/Owner/i);
    await page.locator('[data-logout]').click();
    await page.waitForURL(/\/(login)?$/);
  });
});
