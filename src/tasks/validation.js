import { HttpError } from '../http/errors.js';

export const TASK_TYPES = Object.freeze(['biasa', 'ribet', 'prioritas']);
export const TASK_STATUSES = Object.freeze(['pending', 'completed']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseDate(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function assertTaskId(value) {
  if (!UUID_PATTERN.test(String(value ?? ''))) {
    throw new HttpError(400, 'TASK_ID_INVALID', 'ID tugas tidak valid.');
  }
  return String(value).toLowerCase();
}

export function validateTaskInput(input = {}, { partial = false } = {}) {
  const errors = {};
  const result = {};

  if (!partial || Object.prototype.hasOwnProperty.call(input, 'title')) {
    const title = normalizeText(input.title);
    if (!title || title.length > 200) errors.title = 'Nama tugas wajib diisi dan maksimal 200 karakter.';
    else result.title = title;
  }

  if (Object.prototype.hasOwnProperty.call(input, 'description')) {
    if (input.description !== null && typeof input.description !== 'string') {
      errors.description = 'Deskripsi harus berupa teks.';
    } else {
      const description = input.description === null ? null : input.description.trim();
      if (description && description.length > 5000) errors.description = 'Deskripsi maksimal 5000 karakter.';
      else result.description = description || null;
    }
  }

  if (!partial || Object.prototype.hasOwnProperty.call(input, 'taskType')) {
    const taskType = normalizeText(input.taskType || 'biasa');
    if (!TASK_TYPES.includes(taskType)) errors.taskType = 'Jenis tugas tidak valid.';
    else result.taskType = taskType;
  }

  if (!partial || Object.prototype.hasOwnProperty.call(input, 'deadline')) {
    const deadline = parseDate(input.deadline);
    if (!deadline) errors.deadline = 'Deadline wajib berupa tanggal dan waktu yang valid.';
    else result.deadline = deadline;
  }

  if (partial && Object.prototype.hasOwnProperty.call(input, 'status')) {
    const status = normalizeText(input.status);
    if (!TASK_STATUSES.includes(status)) errors.status = 'Status tugas tidak valid.';
    else result.status = status;
  }

  return { values: result, errors };
}

export function validateStatusInput(input = {}) {
  const status = normalizeText(input.status);
  if (!TASK_STATUSES.includes(status)) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Status tugas tidak valid.', { status: 'Gunakan pending atau completed.' });
  }
  return status;
}

export function parseTaskFilters(query = {}) {
  const errors = {};
  const filters = {
    search: normalizeText(query.search ?? query.q),
    taskType: normalizeText(query.taskType),
    status: normalizeText(query.status),
    flag: normalizeText(query.flag),
    ownerId: normalizeText(query.ownerId),
    deadlineFrom: null,
    deadlineTo: null,
    limit: Math.min(Math.max(Number.parseInt(query.limit ?? '50', 10) || 50, 1), 100),
    offset: Math.max(Number.parseInt(query.offset ?? '0', 10) || 0, 0),
    sort: normalizeText(query.sort) || 'deadline_asc',
  };

  if (filters.search.length > 100) errors.search = 'Pencarian maksimal 100 karakter.';
  if (filters.taskType && !TASK_TYPES.includes(filters.taskType)) errors.taskType = 'Jenis tugas tidak valid.';
  if (filters.status && !TASK_STATUSES.includes(filters.status)) errors.status = 'Status tugas tidak valid.';
  if (filters.flag && !['urgent', 'overdue'].includes(filters.flag)) errors.flag = 'Filter deadline tidak valid.';
  if (filters.ownerId && !UUID_PATTERN.test(filters.ownerId)) errors.ownerId = 'Pemilik tugas tidak valid.';
  if (!['deadline_asc', 'deadline_desc', 'created_desc', 'created_asc'].includes(filters.sort)) errors.sort = 'Urutan tugas tidak valid.';

  if (query.deadlineFrom !== undefined) {
    filters.deadlineFrom = parseDate(query.deadlineFrom);
    if (!filters.deadlineFrom) errors.deadlineFrom = 'Batas awal deadline tidak valid.';
  }
  if (query.deadlineTo !== undefined) {
    filters.deadlineTo = parseDate(query.deadlineTo);
    if (!filters.deadlineTo) errors.deadlineTo = 'Batas akhir deadline tidak valid.';
  }
  if (filters.deadlineFrom && filters.deadlineTo && filters.deadlineFrom > filters.deadlineTo) {
    errors.deadlineRange = 'Rentang deadline tidak valid.';
  }

  return { filters, errors };
}
