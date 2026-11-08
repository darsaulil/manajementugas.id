import { env } from '../src/config/env.js';
import { nicknameFromLoginId } from '../src/auth/nickname.js';
import { hashPassword } from '../src/auth/password.js';
import { pool } from '../src/db/pool.js';

const accounts = [
  { id: '10000000-0000-4000-8000-000000000001', loginId: 'owner-demo', email: 'owner-demo@example.com', role: 'owner' },
  { id: '20000000-0000-4000-8000-000000000001', loginId: 'user-demo-01', email: 'user-demo-01@example.com', role: 'user' },
  { id: '20000000-0000-4000-8000-000000000002', loginId: 'user-demo-02', email: 'user-demo-02@example.com', role: 'user' },
  { id: '20000000-0000-4000-8000-000000000003', loginId: 'user-demo-03', email: 'user-demo-03@example.com', role: 'user' },
  { id: '20000000-0000-4000-8000-000000000004', loginId: 'user-demo-04', email: 'user-demo-04@example.com', role: 'user' },
  { id: '20000000-0000-4000-8000-000000000005', loginId: 'user-demo-05', email: 'user-demo-05@example.com', role: 'user' },
];

const userAccounts = accounts.slice(1);

function requireSeedConfiguration() {
  if (env.nodeEnv !== 'development' || process.env.SEED_ENABLED !== 'true') {
    throw new Error('Seed requires NODE_ENV=development and SEED_ENABLED=true.');
  }

  const ownerPassword = process.env.SEED_OWNER_PASSWORD;
  const userPassword = process.env.SEED_USER_PASSWORD;
  if (!ownerPassword || !userPassword || ownerPassword.length < 12 || userPassword.length < 12) {
    throw new Error('SEED_OWNER_PASSWORD and SEED_USER_PASSWORD must each contain at least 12 characters.');
  }

  return { ownerPassword, userPassword };
}

function taskDefinitions() {
  const now = Date.now();
  const definitions = [
    ['Rancang agenda mingguan', 'biasa', 'completed', -172_800_000, -86_400_000],
    ['Susun prioritas utama', 'prioritas', 'pending', 14_400_000, null],
    ['Review catatan proyek', 'ribet', 'pending', -172_800_000, null],
  ];

  return userAccounts.flatMap((account, userIndex) => definitions.map((definition, taskIndex) => {
    const [title, taskType, status, deadlineOffset, completedOffset] = definition;
    const taskNumber = userIndex * definitions.length + taskIndex + 1;
    return {
      id: `30000000-0000-4000-8000-${String(taskNumber).padStart(12, '0')}`,
      ownerId: account.id,
      title: `${title} — ${String(userIndex + 1).padStart(2, '0')}`,
      description: `Data pengujian untuk ${account.loginId}.`,
      taskType,
      status,
      deadline: new Date(now + deadlineOffset),
      completedAt: completedOffset === null ? null : new Date(now + completedOffset),
    };
  }));
}

async function run() {
  const { ownerPassword, userPassword } = requireSeedConfiguration();
  const passwordHashes = {
    owner: await hashPassword(ownerPassword),
    user: await hashPassword(userPassword),
  };
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const account of accounts) {
      await client.query(`
        INSERT INTO users (id, login_id, nickname, email, role, password_hash, is_active, email_verified_at)
        VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW())
        ON CONFLICT (id) DO NOTHING
      `, [
        account.id,
        account.loginId,
        nicknameFromLoginId(account.loginId),
        account.email,
        account.role,
        passwordHashes[account.role],
      ]);
    }

    for (const task of taskDefinitions()) {
      await client.query(`
        INSERT INTO tasks (id, owner_id, title, description, task_type, status, deadline, completed_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO NOTHING
      `, [
        task.id,
        task.ownerId,
        task.title,
        task.description,
        task.taskType,
        task.status,
        task.deadline,
        task.completedAt,
      ]);
    }

    await client.query('COMMIT');

    const userCounts = await client.query('SELECT role, COUNT(*)::int AS count FROM users GROUP BY role ORDER BY role');
    const taskCount = await client.query('SELECT COUNT(*)::int AS count FROM tasks');
    console.log(JSON.stringify({
      seededAccounts: accounts.length,
      seededTasks: taskDefinitions().length,
      databaseCounts: {
        usersByRole: userCounts.rows,
        tasks: taskCount.rows[0].count,
      },
    }));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error('Seed failed.');
  process.exitCode = 1;
});
