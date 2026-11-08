import { HttpError } from '../http/errors.js';
import { isValidCsrf, loadSession } from './session.js';

export async function optionalAuth(request, response, next) {
  try {
    await loadSession(request, response);
    next();
  } catch (error) {
    next(error);
  }
}

export async function requireAuth(request, response, next) {
  try {
    await loadSession(request, response);
    if (!request.auth) {
      throw new HttpError(401, 'AUTH_REQUIRED', 'Sesi login diperlukan.');
    }
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(role) {
  return (request, response, next) => {
    if (!request.auth) {
      next(new HttpError(401, 'AUTH_REQUIRED', 'Sesi login diperlukan.'));
      return;
    }
    if (request.auth.role !== role) {
      next(new HttpError(403, 'FORBIDDEN', 'Akses ditolak.'));
      return;
    }
    next();
  };
}

export function requireCsrf(request, response, next) {
  if (!isValidCsrf(request)) {
    next(new HttpError(403, 'CSRF_INVALID', 'Permintaan keamanan tidak valid.'));
    return;
  }
  next();
}
