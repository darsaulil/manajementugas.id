import { pool } from './pool.js';

export async function checkDatabaseConnection() {
  const result = await pool.query('SELECT 1::int AS connectivity_check');
  const connectivityCheck = result.rows[0]?.connectivity_check;

  if (connectivityCheck !== 1) {
    throw new Error('Database connectivity check returned an unexpected result.');
  }

  return {
    status: 'connected',
    query: 'SELECT 1',
  };
}
