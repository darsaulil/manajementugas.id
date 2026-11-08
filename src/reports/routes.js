import { Router } from 'express';

import { requireAuth } from '../auth/middleware.js';
import { HttpError } from '../http/errors.js';
import { getReport } from './service.js';

const router = Router();
router.use(requireAuth);

function parsePeriod(query = {}) {
  const mode = String(query.mode ?? 'daily').trim();
  const value = String(query.value ?? (mode === 'monthly' ? new Date().toISOString().slice(0, 7) : new Date().toISOString().slice(0, 10))).trim();
  if (!['daily', 'monthly'].includes(mode)) throw new HttpError(422, 'REPORT_PERIOD_INVALID', 'Mode laporan harus daily atau monthly.');

  let year;
  let month;
  let day;
  if (mode === 'daily') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) throw new HttpError(422, 'REPORT_PERIOD_INVALID', 'Tanggal harian harus menggunakan format YYYY-MM-DD.');
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  } else {
    const match = /^(\d{4})-(\d{2})$/.exec(value);
    if (!match) throw new HttpError(422, 'REPORT_PERIOD_INVALID', 'Bulan harus menggunakan format YYYY-MM.');
    year = Number(match[1]);
    month = Number(match[2]);
    day = 1;
  }

  const start = mode === 'daily' ? new Date(Date.UTC(year, month - 1, day)) : new Date(Date.UTC(year, month - 1, 1));
  const end = mode === 'daily' ? new Date(Date.UTC(year, month - 1, day + 1)) : new Date(Date.UTC(year, month, 1));
  const validInput = mode === 'daily'
    ? start.getUTCFullYear() === year && start.getUTCMonth() === month - 1 && start.getUTCDate() === day
    : start.getUTCFullYear() === year && start.getUTCMonth() === month - 1;
  if (!validInput) throw new HttpError(422, 'REPORT_PERIOD_INVALID', 'Periode laporan tidak valid.');

  return {
    mode,
    value,
    start: start.toISOString(),
    end: end.toISOString(),
    label: mode === 'daily' ? start.toLocaleDateString('id-ID', { timeZone: 'UTC', dateStyle: 'long' }) : start.toLocaleDateString('id-ID', { timeZone: 'UTC', month: 'long', year: 'numeric' }),
  };
}

router.get('/', async (request, response, next) => {
  try {
    const report = await getReport(request.auth, parsePeriod(request.query));
    response.status(200).json({ data: { report } });
  } catch (error) {
    next(error);
  }
});

export { router as reportRouter };
