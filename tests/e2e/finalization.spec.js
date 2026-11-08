import { test, expect } from '@playwright/test';
import { uniqueId } from './helpers/auth.js';

const isDesktop = (testInfo) => testInfo.project.name === 'desktop';
const TEST_PW = 'E2eTest!2026x';

async function getCsrf(request) {
  const res = await request.get('/api/auth/csrf');
  if (!res.ok()) return null;
  const body = await res.json().catch(() => null);
  return body?.data?.csrfToken || null;
}

async function apiJson(request, method, path, data) {
  const headers = {};
  if (['POST', 'PATCH', 'DELETE', 'PUT'].includes(method)) {
    const csrf = await getCsrf(request);
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }
  const res = await request.fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    data: data === undefined ? undefined : data,
  });
  const body = await res.json().catch(() => null);
  return { res, body, status: res.status(), ok: res.ok() };
}

async function registerAndLogin(browser, baseURL, loginId) {
  const context = await browser.newContext({ baseURL });
  const req = context.request;
  const reg = await apiJson(req, 'POST', '/api/auth/register', {
    loginId, email: '', password: TEST_PW, passwordConfirmation: TEST_PW,
  });
  if (!reg.ok && reg.status !== 409) throw new Error(`register failed ${reg.status}`);
  if (reg.status === 409) {
    await apiJson(req, 'POST', '/api/auth/login', { loginId, password: TEST_PW });
  }
  return context;
}

test.describe('Finalization B - Cross-user isolation (2 temp users)', () => {
  test.beforeEach(({}, testInfo) => test.skip(!isDesktop(testInfo), 'Functional isolation check runs on desktop'));

  test('User A cannot read/update/complete/delete User B task via API; Owner access remains per rules', async ({ browser, baseURL, page }) => {
    test.setTimeout(90000);
    const idA = uniqueId('fina');
    const idB = uniqueId('finb');
    const ctxA = await registerAndLogin(browser, baseURL, idA);
    const ctxB = await registerAndLogin(browser, baseURL, idB);
    try {
      const created = await apiJson(ctxB.request, 'POST', '/api/tasks', {
        title: `B-Private ${uniqueId()}`,
        description: 'private',
        taskType: 'biasa',
        deadline: new Date(Date.now() + 86400000).toISOString(),
      });
      expect(created.ok, `B create task: ${created.status}`).toBeTruthy();
      const taskId = created.body?.data?.task?.id || created.body?.data?.id || created.body?.task?.id;
      expect(taskId, 'task id').toBeTruthy();

      // User A attempts to access/modify B's task
      const read = await ctxA.request.get(`/api/tasks/${taskId}`);
      expect([403, 404], `A read B task`).toContain(read.status());
      const patch = await apiJson(ctxA.request, 'PATCH', `/api/tasks/${taskId}`, { title: 'hijack' });
      expect([403, 404], `A patch B task`).toContain(patch.status);
      const complete = await apiJson(ctxA.request, 'PATCH', `/api/tasks/${taskId}/status`, { status: 'completed' });
      expect([403, 404], `A complete B task`).toContain(complete.status);
      const del = await apiJson(ctxA.request, 'DELETE', `/api/tasks/${taskId}`);
      expect([403, 404], `A delete B task`).toContain(del.status);

      // B can still manage own task (UI spot-check optional) and delete it (cleanup)
      const own = await ctxB.request.get(`/api/tasks/${taskId}`);
      expect(own.ok(), 'B can read own task').toBeTruthy();
      const ownDel = await apiJson(ctxB.request, 'DELETE', `/api/tasks/${taskId}`);
      expect(ownDel.ok, `B delete own: ${ownDel.status}`).toBeTruthy();

      // Owner access remains per business rules (owner endpoints require owner; verify owner can load overview)
      const ownerId = process.env.E2E_OWNER_LOGIN_ID;
      const ownerPw = process.env.E2E_OWNER_PASSWORD;
      if (ownerId && ownerPw) {
        await page.goto('/login');
        await page.locator('[data-auth-form="login"] input[name="loginId"]').fill(ownerId);
        await page.locator('[data-auth-form="login"] input[name="password"]').fill(ownerPw);
        await Promise.all([
          page.waitForURL((u) => u.pathname.startsWith('/owner'), { timeout: 20000 }),
          page.locator('[data-auth-form="login"] button[type="submit"]').click(),
        ]);
        await expect(page.locator('[data-stats]')).toBeVisible({ timeout: 20000 });
      }
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});

test.describe('Finalization C - Deterministic urgent/overdue', () => {
  test.beforeEach(({}, testInfo) => test.skip(!isDesktop(testInfo), 'Functional check runs on desktop'));

  test('task due within 3 days is Mendesak; overdue is Kedaluwarsa and can be completed', async ({ browser, baseURL }) => {
    test.setTimeout(90000);
    const id = uniqueId('finc');
    const ctx = await registerAndLogin(browser, baseURL, id);
    try {
      // Urgent: +2 days (<=3 days, pending)
      const urgentDeadline = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString();
      const urgent = await apiJson(ctx.request, 'POST', '/api/tasks', {
        title: `FIN Urgent ${uniqueId()}`, taskType: 'biasa', deadline: urgentDeadline,
      });
      expect(urgent.ok).toBeTruthy();
      const urgentId = urgent.body?.data?.task?.id || urgent.body?.task?.id;
      const list1 = await ctx.request.get('/api/tasks');
      const tasks1 = (await list1.json())?.data?.tasks || [];
      const u = tasks1.find((t) => t.id === urgentId);
      expect(u, 'urgent task found').toBeTruthy();
      expect(u.isUrgent || /mendesak/i.test(String(u.statusLabel || '')), 'urgent flag').toBeTruthy();

      // Overdue: past, can be completed
      const over = await apiJson(ctx.request, 'POST', '/api/tasks', {
        title: `FIN Over ${uniqueId()}`, taskType: 'biasa', deadline: new Date(Date.now() - 2 * 86400000).toISOString(),
      });
      expect(over.ok).toBeTruthy();
      const overId = over.body?.data?.task?.id || over.body?.task?.id;
      const list2 = await ctx.request.get('/api/tasks');
      const tasks2 = (await list2.json())?.data?.tasks || [];
      const o = tasks2.find((t) => t.id === overId);
      expect(o?.isOverdue || o?.status === 'overdue' || o?.is_overdue, 'overdue flag').toBeTruthy();
      const done = await apiJson(ctx.request, 'PATCH', `/api/tasks/${overId}/status`, { status: 'completed' });
      expect(done.ok, `complete overdue: ${done.status}`).toBeTruthy();

      // cleanup
      if (urgentId) await apiJson(ctx.request, 'DELETE', `/api/tasks/${urgentId}`);
      if (overId) await apiJson(ctx.request, 'DELETE', `/api/tasks/${overId}`);
    } finally {
      await ctx.close();
    }
  });
});

test.describe('Finalization D - Report calculations', () => {
  test.beforeEach(({}, testInfo) => test.skip(!isDesktop(testInfo), 'Functional check runs on desktop'));

  test('daily/monthly report values match known temporary data; denominator zero handled', async ({ browser, baseURL }) => {
    test.setTimeout(120000);
    const id = uniqueId('finr');
    const ctx = await registerAndLogin(browser, baseURL, id);
    try {
      const today = new Date();
      const y = today.getUTCFullYear();
      const m = String(today.getUTCMonth() + 1).padStart(2, '0');
      const d = String(today.getUTCDate()).padStart(2, '0');
      const daily = `${y}-${m}-${d}`;
      const monthly = `${y}-${m}`;

      // Create 2 tasks (created in current period)
      const t1 = await apiJson(ctx.request, 'POST', '/api/tasks', { title: `FINR1 ${uniqueId()}`, taskType: 'biasa', deadline: new Date(Date.now() + 86400000).toISOString() });
      const t2 = await apiJson(ctx.request, 'POST', '/api/tasks', { title: `FINR2 ${uniqueId()}`, taskType: 'biasa', deadline: new Date(Date.now() + 86400000).toISOString() });
      expect(t1.ok && t2.ok).toBeTruthy();
      const id1 = t1.body?.data?.task?.id || t1.body?.task?.id;
      const id2 = t2.body?.data?.task?.id || t2.body?.task?.id;
      // complete 1 => completion = completed_in_period / created_in_period (per service logic)
      await apiJson(ctx.request, 'PATCH', `/api/tasks/${id1}/status`, { status: 'completed' });

      const rep = await ctx.request.get(`/api/reports?mode=daily&value=${daily}`);
      expect(rep.ok(), `report daily: ${rep.status()}`).toBeTruthy();
      const body = await rep.json();
      const summary = body?.data?.report?.summary || body?.data?.summary || {};
      // createdInPeriod should be >= 2 (our temp tasks), completedInPeriod >= 1
      expect(Number(summary.createdInPeriod ?? summary.created_in_period ?? 0)).toBeGreaterThanOrEqual(2);
      expect(Number(summary.completedInPeriod ?? summary.completed_in_period ?? 0)).toBeGreaterThanOrEqual(1);
      const createdP = Number(summary.createdInPeriod ?? summary.created_in_period ?? 0);
      const completedP = Number(summary.completedInPeriod ?? summary.completed_in_period ?? 0);
      const pct = Number(summary.periodCompletionPercentage ?? summary.period_completion_percentage ?? 0);
      const expected = createdP === 0 ? 0 : Math.round((completedP * 1000) / createdP) / 10; // 1 decimal like service
      expect(Math.abs(pct - expected)).toBeLessThanOrEqual(0.11);

      // Denominator zero: future month where temp user created nothing
      const futureMonth = `${y + 2}-01`;
      const rep0 = await ctx.request.get(`/api/reports?mode=monthly&value=${futureMonth}`);
      expect(rep0.ok()).toBeTruthy();
      const b0 = await rep0.json();
      const s0 = b0?.data?.report?.summary || b0?.data?.summary || {};
      // if no tasks created in that period for this user, percentage must be 0 (not NaN/Infinity)
      const c0 = Number(s0.createdInPeriod ?? s0.created_in_period ?? 0);
      const p0 = Number(s0.periodCompletionPercentage ?? s0.period_completion_percentage ?? 0);
      if (c0 === 0) expect(p0).toBe(0);
      expect(Number.isFinite(p0)).toBeTruthy();

      // cleanup
      if (id1) await apiJson(ctx.request, 'DELETE', `/api/tasks/${id1}`);
      if (id2) await apiJson(ctx.request, 'DELETE', `/api/tasks/${id2}`);
    } finally {
      await ctx.close();
    }
  });
});

test.describe('Finalization E - Account settings', () => {
  test.beforeEach(({}, testInfo) => test.skip(!isDesktop(testInfo), 'Functional check runs on desktop'));

  test('nickname change persists after reload; email change works in TEST mode (no real email)', async ({ browser, baseURL }) => {
    test.setTimeout(90000);
    const id = uniqueId('fine');
    const ctx = await registerAndLogin(browser, baseURL, id);
    const page = await ctx.newPage();
    try {
      await page.goto('/settings');
      await expect(page.locator('[data-nickname-form]')).toBeVisible({ timeout: 20000 });
      const newNick = `Nick ${uniqueId('n')}`.slice(0, 24);
      const nickInput = page.locator('[data-nickname-form] input[name="nickname"]');
      await nickInput.click();
      await nickInput.fill('');
      await nickInput.fill(newNick);
      await expect(nickInput).toHaveValue(newNick);
      await page.locator('[data-nickname-form] button[type="submit"]').click();
      await expect(page.locator('[data-feedback]')).toContainText(/Nickname berhasil diperbarui/i, { timeout: 15000 });
      await expect(page.locator('[data-nickname]')).toHaveValue(newNick, { timeout: 15000 });
      await page.reload();
      await expect(page.locator('[data-nickname]')).toHaveValue(newNick, { timeout: 20000 });

      // Email change in TEST mode (no real email sent; server has EMAIL_MODE=test)
      const newEmail = `${uniqueId('mail')}@example.test`;
      await page.locator('[data-email-form] input[name="newEmail"]').fill(newEmail);
      await page.locator('[data-email-form] input[name="currentPassword"]').fill(TEST_PW);
      await page.locator('[data-email-form] button[type="submit"]').click();
      // Accept success/test-capture/provider messaging; must not break session
      await expect(page.locator('[data-feedback]')).toContainText(/Email berubah|verifikasi|provider|belum aktif/i, { timeout: 15000 });
      await page.goto('/settings');
      await expect(page.locator('[data-login-id]')).toBeVisible({ timeout: 15000 }); // session still valid
      // E2E accounts untouched by this flow (used temp user)
    } finally {
      await page.close().catch(()=>{});
      await ctx.close();
    }
  });
});
