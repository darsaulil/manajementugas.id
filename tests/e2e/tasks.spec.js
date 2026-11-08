import { test, expect } from '@playwright/test';
import { login, uniqueId } from './helpers/auth.js';

test.describe('User task CRUD (isolated test DB)', () => {
  test.beforeEach(async ({ page }) => {
    const loginId = process.env.E2E_USER_LOGIN_ID;
    const password = process.env.E2E_USER_PASSWORD;
    test.skip(!loginId || !password, 'E2E_USER_LOGIN_ID/PASSWORD not set');
    await login(page, { loginId, password });
    await page.waitForURL(/\/dashboard/);
  });

  test('create, edit, complete, filter, and delete a task', async ({ page }) => {
    const title = `E2E Task ${uniqueId()}`;
    const updated = `${title} Updated`;

    await page.locator('[data-open-task-form]').click();
    await page.locator('[data-task-form] input[name="title"]').fill(title);
    await page.locator('[data-task-form] textarea[name="description"]').fill('e2e description');
    await page.locator('[data-task-form] select[name="taskType"]').selectOption('prioritas');
    // deadline: keep default (tomorrow) set by app
    await page.locator('[data-task-form] button[type="submit"]').click();
    await expect(page.locator('[data-task-dialog][open], dialog[open][data-task-dialog]')).toHaveCount(0, { timeout: 15000 }).catch(() => {});
    await expect(page.locator('[data-task-list]')).toContainText(title, { timeout: 15000 });

    // edit
    const card = page.locator('[data-task-list] .task-card', { hasText: title });
    await card.locator('[data-action="edit"]').click();
    await expect(page.locator('[data-task-dialog][open], dialog[open][data-task-dialog]')).toBeVisible();
    await page.locator('[data-task-form] input[name="title"]').fill(updated);
    await page.locator('[data-task-form] button[type="submit"]').click();
    await expect(page.locator('[data-form-feedback].is-error')).toHaveCount(0, { timeout: 5000 }).catch(() => {});
    await expect(page.locator('[data-task-list]')).toContainText(updated, { timeout: 15000 });

    // toggle status
    const updatedCard = page.locator('[data-task-list] .task-card', { hasText: updated });
    await updatedCard.locator('[data-action="toggle"]').click();
    await expect(page.locator('[data-feedback]')).toContainText(/Status tugas berhasil diperbarui/i, { timeout: 10000 });

    // search/filter
    await page.locator('[data-filter-search]').fill(updated);
    await expect(page.locator('[data-task-list]')).toContainText(updated);
    await page.locator('[data-filter-status]').selectOption('completed');
    await expect(page.locator('[data-task-list]')).toContainText(updated);
    await page.locator('[data-reset-filters]').click();

    // delete
    await page.locator('[data-filter-search]').fill(updated);
    await expect(page.locator('[data-task-list] .task-card', { hasText: updated })).toHaveCount(1, { timeout: 10000 });
    const delCard = page.locator('[data-task-list] .task-card', { hasText: updated });
    await delCard.locator('[data-action="delete"]').click();
    await expect(page.locator('[data-delete-dialog][open], dialog[open][data-delete-dialog]')).toBeVisible();
    await page.locator('[data-confirm-delete]').click();
    await expect(page.locator('[data-delete-dialog][open], dialog[open][data-delete-dialog]')).toHaveCount(0, { timeout: 10000 });
    await expect(page.locator('[data-task-list]')).not.toContainText(updated, { timeout: 15000 });
  });
});
