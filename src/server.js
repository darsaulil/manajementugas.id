import { app } from './app.js';
import { env } from './config/env.js';
import { pool } from './db/pool.js';

// Vercel zero-config Express detects this entrypoint (port listener or default export).
// Local/standalone mode listens; Vercel serverless manages the runtime.
if (!process.env.VERCEL) {
  const server = app.listen(env.port, '0.0.0.0', () => {
    console.log(`ManajemenTugas.id foundation server listening on port ${env.port}.`);
  });

  let isShuttingDown = false;

  async function shutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`Received ${signal}; shutting down.`);

    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  }

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

export default app;
