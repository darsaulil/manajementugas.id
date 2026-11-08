import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { app } from '../src/app.js';
import { pool } from '../src/db/pool.js';

let server;
let baseUrl;

before(async () => {
  server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await pool.end();
});

test('GET /api/health confirms database connectivity without mutating data', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, 'ok');
  assert.equal(body.database.status, 'connected');
  assert.equal(body.database.query, 'SELECT 1');
});

test('unknown routes return a safe JSON 404 response', async () => {
  const response = await fetch(`${baseUrl}/route-yang-tidak-ada`);
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.error.code, 'NOT_FOUND');
});
