import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { authRouter } from './auth/routes.js';
import { requireAuth, requireRole, optionalAuth } from './auth/middleware.js';
import { accountRouter } from './account/routes.js';
import { checkDatabaseConnection } from './db/health.js';
import { errorHandler, HttpError, notFoundHandler } from './http/errors.js';
import { ownerRouter } from './owner/routes.js';
import { reportRouter } from './reports/routes.js';
import { taskRouter } from './tasks/routes.js';

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);
const publicDirectory = path.resolve(currentDirectory, '../public');

export const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({
  frameguard: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ['https://*.manus.computer'],
      upgradeInsecureRequests: null,
    },
  },
}));
app.use(express.json({ limit: '100kb' }));
app.use(express.static(publicDirectory));

app.get('/login', (request, response) => response.sendFile(path.join(publicDirectory, 'login.html')));
app.get('/register', (request, response) => response.sendFile(path.join(publicDirectory, 'register.html')));
app.get('/forgot-password', (request, response) => response.sendFile(path.join(publicDirectory, 'forgot-password.html')));
app.get('/reset-password', (request, response) => response.sendFile(path.join(publicDirectory, 'reset-password.html')));
app.get('/verify-email', (request, response) => response.sendFile(path.join(publicDirectory, 'verify-email.html')));

app.use(optionalAuth);

app.get('/api/health', async (request, response, next) => {
  try {
    const database = await checkDatabaseConnection();
    response.status(200).json({ status: 'ok', service: 'manajementugas', database });
  } catch (error) {
    next(error);
  }
});

app.use('/api/auth', authRouter);
app.use('/api/account', accountRouter);
app.use('/api/owner', ownerRouter);
app.use('/api/reports', reportRouter);
app.use('/api/tasks', taskRouter);

app.get('/api/user/access-check', requireRole('user'), (request, response) => {
  response.status(200).json({ data: { role: request.auth.role, access: 'user' } });
});

app.get('/api/owner/access-check', requireRole('owner'), (request, response) => {
  response.status(200).json({ data: { role: request.auth.role, access: 'owner' } });
});

app.get('/dashboard', requireAuth, requireRole('user'), (request, response) => response.sendFile(path.join(publicDirectory, 'tasks.html')));
app.get('/owner/dashboard', requireAuth, requireRole('owner'), (request, response) => response.sendFile(path.join(publicDirectory, 'owner-dashboard.html')));
app.get('/tasks', requireAuth, (request, response) => response.sendFile(path.join(publicDirectory, 'tasks.html')));
app.get('/owner/tasks', requireAuth, requireRole('owner'), (request, response) => response.sendFile(path.join(publicDirectory, 'tasks.html')));
app.get('/reports', requireAuth, (request, response) => response.sendFile(path.join(publicDirectory, 'reports.html')));
app.get('/settings', requireAuth, (request, response) => response.sendFile(path.join(publicDirectory, 'settings.html')));

app.use(notFoundHandler);
app.use((error, request, response, next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    next(new HttpError(400, 'INVALID_JSON', 'Format JSON tidak valid.'));
    return;
  }
  next(error);
});
app.use(errorHandler);
