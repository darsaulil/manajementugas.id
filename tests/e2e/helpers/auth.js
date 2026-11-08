import { expect } from '@playwright/test';

export async function login(page, { loginId, password }) {
  await page.goto('/login');
  await page.locator('[data-auth-form="login"] input[name="loginId"]').fill(loginId);
  await page.locator('[data-auth-form="login"] input[name="password"]').fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20000 }),
    page.locator('[data-auth-form="login"] button[type="submit"]').click(),
  ]);
}

export async function logout(page) {
  const btn = page.locator('[data-logout]');
  await expect(btn).toBeVisible();
  await btn.click();
  await page.waitForURL(/\/(login|$)/);
}

export function uniqueId(prefix = 'e2e') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export const viewports = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
};
