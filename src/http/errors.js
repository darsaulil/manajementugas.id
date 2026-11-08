export class HttpError extends Error {
  constructor(statusCode, code, message, details = undefined) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function notFoundHandler(request, response) {
  response.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Rute yang diminta tidak ditemukan.',
    },
  });
}

export function errorHandler(error, request, response, next) {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (error?.code === '23505') {
    const constraint = String(error?.constraint ?? '');
    const fieldMessages = {
      users_login_id_key: 'ID pengguna sudah terdaftar.',
      users_email_lower_uidx: 'Email sudah digunakan.',
      users_nickname_lower_uidx: 'Nickname sudah digunakan.',
    };
    response.status(409).json({
      error: {
        code: 'CONFLICT',
        message: fieldMessages[constraint] ?? 'Data yang dikirim sudah digunakan.',
      },
    });
    return;
  }

  const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
  const payload = {
    error: {
      code: error?.code ?? 'INTERNAL_ERROR',
      message: statusCode >= 500 ? 'Terjadi kesalahan internal.' : error.message,
    },
  };
  if (error?.details && statusCode < 500) payload.error.details = error.details;

  if (statusCode >= 500) {
    console.error('Request failed.', { method: request.method, path: request.path });
  }
  response.status(statusCode).json(payload);
}
