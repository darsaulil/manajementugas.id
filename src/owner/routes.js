import { Router } from 'express';

import { requireAuth, requireCsrf, requireRole } from '../auth/middleware.js';
import { HttpError } from '../http/errors.js';
import { listTasks } from '../tasks/service.js';
import { assertTaskId } from '../tasks/validation.js';
import { getOwnerOverview, getOwnerUserDetail, setUserActiveStatus } from './service.js';

const router = Router();
router.use(requireAuth, requireRole('owner'));

function parseUserFilters(query = {}) {
  const search = String(query.search ?? '').trim();
  const status = String(query.status ?? 'all').trim();
  const limit = Math.min(Math.max(Number.parseInt(query.limit ?? '50', 10) || 50, 1), 100);
  const offset = Math.max(Number.parseInt(query.offset ?? '0', 10) || 0, 0);
  const errors = {};
  if (search.length > 100) errors.search = 'Pencarian maksimal 100 karakter.';
  if (!['all', 'active', 'inactive'].includes(status)) errors.status = 'Filter status akun tidak valid.';
  if (Object.keys(errors).length > 0) throw new HttpError(422, 'VALIDATION_ERROR', 'Filter pengguna tidak valid.', errors);
  return { search, status, limit, offset };
}

router.get('/overview', async (request, response, next) => {
  try {
    const filters = parseUserFilters(request.query);
    const overview = await getOwnerOverview(filters);
    response.status(200).json({ data: { overview } });
  } catch (error) {
    next(error);
  }
});

router.get('/users', async (request, response, next) => {
  try {
    const filters = parseUserFilters(request.query);
    const overview = await getOwnerOverview(filters);
    response.status(200).json({ data: { users: overview.userSummaries, filters } });
  } catch (error) {
    next(error);
  }
});

router.get('/users/:userId', async (request, response, next) => {
  try {
    const userId = assertTaskId(request.params.userId);
    const user = await getOwnerUserDetail(userId);
    if (!user) throw new HttpError(404, 'USER_NOT_FOUND', 'Pengguna tidak ditemukan.');
    const tasks = await listTasks(request.auth, {
      ownerId: userId,
      search: '',
      taskType: '',
      status: '',
      flag: '',
      deadlineFrom: null,
      deadlineTo: null,
      sort: 'created_desc',
      limit: 20,
      offset: 0,
    });
    response.status(200).json({ data: { user, tasks } });
  } catch (error) {
    next(error);
  }
});

router.patch('/users/:userId/status', requireCsrf, async (request, response, next) => {
  try {
    const userId = assertTaskId(request.params.userId);
    if (typeof request.body?.isActive !== 'boolean') {
      throw new HttpError(422, 'VALIDATION_ERROR', 'Status akun harus berupa boolean.', { isActive: 'Gunakan true atau false.' });
    }
    const status = await setUserActiveStatus(request.auth, userId, request.body.isActive);
    const user = await getOwnerUserDetail(userId);
    response.status(200).json({ data: { status, user } });
  } catch (error) {
    next(error);
  }
});

export { router as ownerRouter };
