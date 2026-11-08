import { Router } from 'express';

import { HttpError } from '../http/errors.js';
import { requireAuth, requireCsrf } from '../auth/middleware.js';
import {
  createTask,
  deleteTask,
  findTask,
  listTasks,
  summarizeTasks,
  updateTask,
} from './service.js';
import {
  assertTaskId,
  parseTaskFilters,
  validateStatusInput,
  validateTaskInput,
} from './validation.js';

const router = Router();
router.use(requireAuth);

function invalidInput(errors) {
  return new HttpError(422, 'VALIDATION_ERROR', 'Periksa kembali data tugas yang dikirim.', errors);
}

function notFound() {
  return new HttpError(404, 'TASK_NOT_FOUND', 'Tugas tidak ditemukan.');
}

router.get('/summary', async (request, response, next) => {
  try {
    const summary = await summarizeTasks(request.auth);
    response.status(200).json({ data: { summary } });
  } catch (error) {
    next(error);
  }
});

router.get('/', async (request, response, next) => {
  try {
    const { filters, errors } = parseTaskFilters(request.query);
    if (Object.keys(errors).length > 0) throw invalidInput(errors);
    const tasks = await listTasks(request.auth, filters);
    response.status(200).json({ data: { tasks, filters } });
  } catch (error) {
    next(error);
  }
});

router.get('/:taskId', async (request, response, next) => {
  try {
    const task = await findTask(request.auth, assertTaskId(request.params.taskId));
    if (!task) throw notFound();
    response.status(200).json({ data: { task } });
  } catch (error) {
    next(error);
  }
});

router.post('/', requireCsrf, async (request, response, next) => {
  try {
    const input = validateTaskInput(request.body ?? {});
    if (Object.keys(input.errors).length > 0) throw invalidInput(input.errors);
    const task = await createTask(request.auth, input.values);
    response.status(201).json({ data: { task } });
  } catch (error) {
    next(error);
  }
});

router.patch('/:taskId/status', requireCsrf, async (request, response, next) => {
  try {
    const taskId = assertTaskId(request.params.taskId);
    const status = validateStatusInput(request.body ?? {});
    const task = await updateTask(request.auth, taskId, { status });
    if (!task) throw notFound();
    response.status(200).json({ data: { task } });
  } catch (error) {
    next(error);
  }
});

router.patch('/:taskId', requireCsrf, async (request, response, next) => {
  try {
    const taskId = assertTaskId(request.params.taskId);
    const input = validateTaskInput(request.body ?? {}, { partial: true });
    if (Object.keys(input.errors).length > 0) throw invalidInput(input.errors);
    if (Object.keys(input.values).length === 0) throw invalidInput({ form: 'Kirim minimal satu field yang dapat diubah.' });
    const task = await updateTask(request.auth, taskId, input.values);
    if (!task) throw notFound();
    response.status(200).json({ data: { task } });
  } catch (error) {
    next(error);
  }
});

router.delete('/:taskId', requireCsrf, async (request, response, next) => {
  try {
    const deleted = await deleteTask(request.auth, assertTaskId(request.params.taskId));
    if (!deleted) throw notFound();
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

export { router as taskRouter };
