import { test, expect } from '@playwright/test';
import { login, uniqueId } from './helpers/auth.js';

const wrongPasswordMsg = 'ID atau password tidak valid.';
const isDesktop = (testInfo) => testInfo.project.name === 'desktop';
const isMobileLike = (testInfo) => ['mobile', 'tablet'].includes(testInfo.project.name);

async function getCsrf(request) {
  const res = await request.get('/api/auth/csrf');
  const body = await res.json().catch(() => null);
  return body?.data?.csrfToken || null;
}

test.describe('Master A - Public pages & navigation', () => {
  test('landing page: title, nav links, auth buttons, and no horizontal overflow', async ({ page }, testInfo) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/ManajemenTugas/i);
    if (isMobileLike(testInfo)) {
      const toggle = page.locator('.nav-toggle');
      await expect(toggle).toBeVisible();
      await toggle.click();
    }
    // Navbar links
    await expect(page.locator('.nav-links a[href="#beranda"]').first()).toBeVisible();
    await expect(page.locator('.nav-links a[href="#tentang"]').first()).toBeVisible();
    await expect(page.locator('.nav-links a[href="#fitur"]').first()).toBeVisible();
    // Auth buttons
    const loginLink = page.locator('a[href="/login"]', { hasText: /Login/i }).first();
    const daftarLink = page.locator('a[href="/register"]', { hasText: /Daftar/i }).first();
    await expect(loginLink).toHaveAttribute('href', '/login');
    await expect(daftarLink).toHaveAttribute('href', '/register');
    // No horizontal overflow
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflow, `overflow on / (${testInfo.project.name})`).toBeFalsy();
  });

  test('landing auth buttons navigate to correct pages', async ({ page }, testInfo) => {
    await page.goto('/');
    if (isMobileLike(testInfo)) await page.locator('.nav-toggle').click();
    await page.locator('a[href="/login"]', { hasText: /Login/i }).first().click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/');
    if (isMobileLike(testInfo)) await page.locator('.nav-toggle').click();
    await page.locator('a[href="/register"]', { hasText: /Daftar/i }).first().click();
    await expect(page).toHaveURL(/\/register/);
  });

  test('landing in-page navigation anchors work', async ({ page }, testInfo) => {
    await page.goto('/');
    if (isMobileLike(testInfo)) await page.locator('.nav-toggle').click();
    await page.locator('a[href="#tentang"]', { hasText: /Tentang/i }).first().click();
    await expect(page).toHaveURL(/#tentang/);
    if (isMobileLike(testInfo)) await page.locator('.nav-toggle').click();
    await page.locator('a[href="#fitur"]', { hasText: /Fitur/i }).first().click();
    await expect(page).toHaveURL(/#fitur/);
  });

  test('mobile/tablet landing hamburger works (open, aria, Escape, close on select)', async ({ page }, testInfo) => {
    test.skip(!isMobileLike(testInfo), 'mobile/tablet viewports only');
    await page.goto('/');
    const toggle = page.locator('.nav-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('[data-nav-menu].is-open, .nav-menu.is-open, #primary-menu.is-open').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // open again and close by selecting a menu item
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await page.locator('#primary-menu a[href="#tentang"]').click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('Master B - Authentication & registration', () => {
  test('login with wrong password shows appropriate error', async ({ page }) => {
    await page.goto('/login');
    await page.locator('[data-auth-form="login"] input[name="loginId"]').fill('e2e-user');
    await page.locator('[data-auth-form="login"] input[name="password"]').fill('WrongPassword!12345');
    await page.locator('[data-auth-form="login"] button[type="submit"]').click();
    await expect(page.locator('[data-auth-message]')).toContainText(wrongPasswordMsg);
    await expect(page).toHaveURL(/\/login/);
  });

  test('unauthenticated access to protected pages is denied', async ({ page }) => {
    for (const path of ['/dashboard', '/owner/dashboard', '/reports', '/settings', '/tasks']) {
      const res = await page.goto(path);
      // requireAuth returns 401 JSON; requireRole(owner) on owner dashboard returns 401/403 when unauth
      expect([401, 403], `unauth access ${path}`).toContain(res?.status() ?? 0);
    }
  });

  test('registration rejects Owner role manipulation via API payload', async ({ request }) => {
    const id = uniqueId('roleatk');
    // Public registration form/API must not create owner; attempt to inject role
    const res = await request.post('/api/auth/register', {
      data: { loginId: id, email: '', password: 'E2eTest!2026x', passwordConfirmation: 'E2eTest!2026x', role: 'owner' },
    });
    // Should either succeed as user (ignoring role) or reject; must not create owner
    if (res.ok()) {
      const body = await res.json();
      expect(body?.data?.user?.role).toBe('user');
    } else {
      expect([400, 422]).toContain(res.status());
    }
  });

  test('registration validates input and password confirmation', async ({ page }) => {
    await page.goto('/register');
    await page.locator('[data-auth-form="register"] input[name="loginId"]').fill('ab'); // too short (HTML pattern blocks)
    await page.locator('[data-auth-form="register"] input[name="email"]').fill('');
    await page.locator('[data-auth-form="register"] input[name="password"]').fill('shortpassword'); // HTML minlength may block
    await page.locator('[data-auth-form="register"] input[name="passwordConfirmation"]').fill('differentpass');
    // Bypass HTML5 constraints to exercise app/server validation feedback path
    await page.locator('[data-auth-form="register"]').evaluate((f) => { f.noValidate = true; });
    await page.locator('[data-auth-form="register"] button[type="submit"]').click();
    await expect(page.locator('[data-auth-message]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-auth-message]')).not.toHaveText('');
  });
});

test.describe('Master C - User dashboard & task management (functional, desktop)', () => {
  test.beforeEach(({}, testInfo) => { test.skip(!isDesktop(testInfo), 'Functional mutating checks run on desktop to avoid duplication'); });

  test('dashboard stats, task types, urgent/overdue behavior, and overdue completion', async ({ page }) => {
    test.setTimeout(60000);
    const loginId = process.env.E2E_USER_LOGIN_ID;
    const password = process.env.E2E_USER_PASSWORD;
    test.skip(!loginId || !password, 'E2E user credentials missing');
    await login(page, { loginId, password });
    await page.waitForURL(/\/dashboard/);

    // Stats elements
    for (const key of ['total', 'completed', 'pending', 'completionPercentage', 'urgent', 'overdue']) {
      await expect(page.locator(`[data-stat="${key}"]`)).toBeVisible();
    }

    // Create a PRIORITAS task with deadline far enough to not be urgent/overdue
    const titleA = `E2E Pri ${uniqueId()}`;
    await page.locator('[data-open-task-form]').click();
    await page.locator('[data-task-form] input[name="title"]').fill(titleA);
    await page.locator('[data-task-form] select[name="taskType"]').selectOption('prioritas');
    await page.locator('[data-task-form] input[name="deadline"]').fill('2030-01-01T10:00');
    await page.locator('[data-task-form] button[type="submit"]').click();
    await expect(page.locator('[data-task-dialog][open], dialog[open][data-task-dialog]')).toHaveCount(0, { timeout: 15000 }).catch(() => {});
    await expect(page.locator('[data-task-list]')).toContainText(titleA, { timeout: 15000 });
    const cardA = page.locator('[data-task-list] .task-card', { hasText: titleA });
    await expect(cardA).toContainText(/Prioritas/);

    // Create an OVERDUE pending task (past deadline) and verify Kedaluwarsa marker; then complete it
    const titleOver = `E2E Over ${uniqueId()}`;
    await page.locator('[data-open-task-form]').click();
    await page.locator('[data-task-form] input[name="title"]').fill(titleOver);
    await page.locator('[data-task-form] select[name="taskType"]').selectOption('biasa');
    await page.locator('[data-task-form] input[name="deadline"]').fill('2020-01-01T10:00');
    await page.locator('[data-task-form] button[type="submit"]').click();
    await expect(page.locator('[data-task-dialog][open], dialog[open][data-task-dialog]')).toHaveCount(0, { timeout: 15000 }).catch(() => {});
    await expect(page.locator('[data-task-list]')).toContainText(titleOver, { timeout: 15000 });
    const cardOver = page.locator('[data-task-list] .task-card', { hasText: titleOver });
    await expect(cardOver).toContainText(/Kedaluwarsa/);
    // Overdue can be completed
    await cardOver.locator('[data-action="toggle"]').click();
    await expect(page.locator('[data-feedback]')).toBeVisible();

    // Cleanup both tasks
    for (const t of [titleA, titleOver]) {
      await page.locator('[data-reset-filters]').click();
      await page.locator('[data-filter-search]').fill(t);
      const c = page.locator('[data-task-list] .task-card', { hasText: t }).first();
      if (await c.count()) {
        await c.locator('[data-action="delete"]').click();
        await expect(page.locator('[data-delete-dialog][open], dialog[open][data-delete-dialog]')).toBeVisible();
        await page.locator('[data-confirm-delete]').click();
        await expect(page.locator('[data-delete-dialog][open], dialog[open][data-delete-dialog]')).toHaveCount(0, { timeout: 10000 });
        await expect(page.locator('[data-task-list]')).not.toContainText(t, { timeout: 15000 });
      }
      await page.locator('[data-reset-filters]').click();
    }
  });

  test('empty state for a fresh registered user', async ({ page }) => {
    test.setTimeout(45000);
    const id = uniqueId('emptyu');
    await page.goto('/register');
    await page.locator('[data-auth-form="register"] input[name="loginId"]').fill(id);
    await page.locator('[data-auth-form="register"] input[name="email"]').fill('');
    await page.locator('[data-auth-form="register"] input[name="password"]').fill('E2eTest!2026x');
    await page.locator('[data-auth-form="register"] input[name="passwordConfirmation"]').fill('E2eTest!2026x');
    await page.locator('[data-auth-form="register"] button[type="submit"]').click();
    await page.waitForURL(/\/dashboard/, { timeout: 20000 });
    await expect(page.locator('[data-empty]')).toBeVisible({ timeout: 15000 });
  });
});

test.describe('Master D - Owner dashboard & role isolation (functional, desktop)', () => {
  test.beforeEach(({}, testInfo) => { test.skip(!isDesktop(testInfo), 'Functional checks run on desktop to avoid duplication'); });

  test('owner sees aggregate stats, chart, user list, filters, and user detail with tasks', async ({ page }) => {
    test.setTimeout(60000);
    const loginId = process.env.E2E_OWNER_LOGIN_ID;
    const password = process.env.E2E_OWNER_PASSWORD;
    test.skip(!loginId || !password, 'E2E owner credentials missing');
    await login(page, { loginId, password });
    await page.waitForURL(/\/owner\/dashboard/);
    await expect(page.locator('[data-stats]')).toBeVisible({ timeout: 20000 });
    // aggregate stat fields
    for (const key of ['totalUsers', 'activeUsers', 'inactiveUsers', 'totalTasks', 'completedTasks', 'pendingTasks', 'urgentTasks', 'overdueTasks', 'completionPercentage']) {
      await expect(page.locator(`[data-stat="${key}"]`)).toBeAttached();
    }
    await expect(page.locator('[data-user-chart]')).toBeVisible();
    await expect(page.locator('[data-user-list]')).toBeVisible();
    await expect(page.locator('[data-user-search]')).toBeVisible();
    await expect(page.locator('[data-user-status]')).toBeVisible();
    // open detail (owner can see user tasks)
    const detailBtn = page.locator('[data-user-list] button[data-action="detail"]').first();
    if (await detailBtn.count()) {
      await detailBtn.click();
      await expect(page.locator('[data-user-dialog]')).toBeVisible();
      await expect(page.locator('[data-detail-body]')).toContainText(/Total task|Task terbaru|Pengguna ini belum memiliki task/);
      await page.locator('[data-close-detail]').click();
    }
  });

  test('user cannot access owner API endpoints', async ({ page }) => {
    const loginId = process.env.E2E_USER_LOGIN_ID;
    const password = process.env.E2E_USER_PASSWORD;
    test.skip(!loginId || !password, 'E2E user credentials missing');
    await login(page, { loginId, password });
    await page.waitForURL(/\/dashboard/);
    const res = await page.request.get('/api/owner/overview');
    expect([401, 403]).toContain(res.status());
  });
});

test.describe('Master E - Reports (functional, desktop)', () => {
  test.beforeEach(({}, testInfo) => { test.skip(!isDesktop(testInfo), 'Functional checks run on desktop'); });

  test('daily and monthly modes work and period switching updates UI', async ({ page }) => {
    test.setTimeout(45000);
    const loginId = process.env.E2E_USER_LOGIN_ID || process.env.E2E_OWNER_LOGIN_ID;
    const password = process.env.E2E_USER_PASSWORD || process.env.E2E_OWNER_PASSWORD;
    test.skip(!loginId || !password, 'E2E credentials missing');
    await login(page, { loginId, password });
    await page.goto('/reports');
    await expect(page.locator('[data-report-mode]')).toBeVisible({ timeout: 20000 });
    // Daily
    await page.locator('[data-report-mode]').selectOption('daily');
    await page.locator('[data-apply-report]').click();
    await expect(page.locator('[data-report-content]')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('[data-report-content]')).not.toHaveAttribute('hidden', '');
    // Monthly
    await page.locator('[data-report-mode]').selectOption('monthly');
    await expect(page.locator('[data-monthly-field]')).toBeVisible();
    await page.locator('[data-apply-report]').click();
    await expect(page.locator('[data-report-content]')).toBeVisible({ timeout: 20000 });
  });
});

test.describe('Master F - Account settings (functional, desktop)', () => {
  test.beforeEach(({}, testInfo) => { test.skip(!isDesktop(testInfo), 'Functional checks run on desktop'); });

  test('settings shows account info and theme persists after reload', async ({ page }) => {
    test.setTimeout(45000);
    const loginId = process.env.E2E_USER_LOGIN_ID || process.env.E2E_OWNER_LOGIN_ID;
    const password = process.env.E2E_USER_PASSWORD || process.env.E2E_OWNER_PASSWORD;
    test.skip(!loginId || !password, 'E2E credentials missing');
    await login(page, { loginId, password });
    await page.goto('/settings');
    await expect(page.locator('[data-nickname]')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('[data-login-id]')).toBeVisible();
    await expect(page.locator('[data-role]')).toBeVisible();
    // Theme persistence
    const toggle = page.locator('[data-theme-toggle], [data-theme-action]').first();
    await expect(toggle).toBeVisible();
    await toggle.click();
    const after = await page.evaluate(() => document.documentElement.dataset.theme || localStorage.getItem('manajementugas-theme'));
    expect(after).toBeTruthy();
    await page.reload();
    await expect(page.locator('[data-nickname]')).toBeVisible({ timeout: 20000 });
    const persisted = await page.evaluate(() => document.documentElement.dataset.theme || localStorage.getItem('manajementugas-theme'));
    expect(persisted).toBe(after);
  });
});

test.describe('Master G - Responsive checks (all viewports)', () => {
  test('key public pages have no horizontal overflow', async ({ page }, testInfo) => {
    for (const path of ['/', '/login', '/register']) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      expect(overflow, `overflow ${path} (${testInfo.project.name})`).toBeFalsy();
    }
  });

  test('authenticated pages have no horizontal overflow and remain usable', async ({ page }, testInfo) => {
    test.setTimeout(60000);
    const loginId = process.env.E2E_USER_LOGIN_ID || process.env.E2E_OWNER_LOGIN_ID;
    const password = process.env.E2E_USER_PASSWORD || process.env.E2E_OWNER_PASSWORD;
    test.skip(!loginId || !password, 'E2E credentials missing');
    await login(page, { loginId, password });
    const targets = ['/dashboard', '/reports', '/settings'];
    for (const path of targets) {
      let res;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          res = await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 20000 });
          break;
        } catch (e) {
          if (attempt === 1) throw e;
          await page.waitForTimeout(500);
        }
      }
      // owner logged in as user fallback won't hit /dashboard if owner; handle role
      if (res && [401, 403].includes(res.status())) continue;
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      expect(overflow, `overflow ${path} (${testInfo.project.name})`).toBeFalsy();
    }
  });

  test('mobile/tablet dashboard hamburger: open/close, aria-expanded, Escape', async ({ page }, testInfo) => {
    test.skip(!isMobileLike(testInfo), 'mobile/tablet only');
    const loginId = process.env.E2E_USER_LOGIN_ID || process.env.E2E_OWNER_LOGIN_ID;
    const password = process.env.E2E_USER_PASSWORD || process.env.E2E_OWNER_PASSWORD;
    test.skip(!loginId || !password, 'E2E credentials missing');
    await login(page, { loginId, password });
    await page.waitForURL(/\/(dashboard|owner\/dashboard)/);
    const toggle = page.locator('.tasks-nav .nav-toggle');
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});
