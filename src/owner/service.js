import { pool } from '../db/pool.js';
import { HttpError } from '../http/errors.js';

function addParam(values, value) {
  values.push(value);
  return `$${values.length}`;
}

function userScope(filters, values) {
  const clauses = [];
  if (filters.search) {
    const search = addParam(values, `%${filters.search}%`);
    clauses.push(`(u.login_id ILIKE ${search} OR u.nickname ILIKE ${search} OR u.email ILIKE ${search})`);
  }
  if (filters.status === 'active') clauses.push('u.is_active = TRUE');
  if (filters.status === 'inactive') clauses.push('u.is_active = FALSE');
  return clauses.length ? clauses.join(' AND ') : 'TRUE';
}

function serializeUserSummary(row) {
  return {
    id: row.id,
    loginId: row.login_id,
    nickname: row.nickname,
    email: row.email,
    role: row.role,
    isActive: Boolean(row.is_active),
    emailVerified: Boolean(row.email_verified_at),
    createdAt: new Date(row.created_at).toISOString(),
    totalTasks: Number(row.total_tasks),
    completedTasks: Number(row.completed_tasks),
    pendingTasks: Number(row.pending_tasks),
    urgentTasks: Number(row.urgent_tasks),
    overdueTasks: Number(row.overdue_tasks),
    completionPercentage: Number(row.completion_percentage),
  };
}

export function assertOwnerStatusChange({ target, activeOwnerCount, actorUserId, isActive }) {
  if (target.role === 'owner' && target.is_active && !isActive && activeOwnerCount <= 1) {
    throw new HttpError(409, 'LAST_OWNER_PROTECTED', 'Owner terakhir tidak dapat dinonaktifkan.');
  }
  if (target.role === 'owner' && target.id === actorUserId && !isActive) {
    throw new HttpError(409, 'SELF_DEACTIVATION_FORBIDDEN', 'Owner tidak dapat menonaktifkan akunnya sendiri.');
  }
}

const userSummarySelect = `
  SELECT
    u.id,
    u.login_id,
    u.nickname,
    u.email,
    u.role,
    u.is_active,
    u.email_verified_at,
    u.created_at,
    COUNT(t.id)::int AS total_tasks,
    COUNT(t.id) FILTER (WHERE t.status = 'completed')::int AS completed_tasks,
    COUNT(t.id) FILTER (WHERE t.status = 'pending')::int AS pending_tasks,
    COUNT(t.id) FILTER (WHERE t.status = 'pending' AND t.deadline >= NOW() AND t.deadline <= NOW() + INTERVAL '3 days')::int AS urgent_tasks,
    COUNT(t.id) FILTER (WHERE t.status = 'pending' AND t.deadline < NOW())::int AS overdue_tasks,
    COALESCE(ROUND((COUNT(t.id) FILTER (WHERE t.status = 'completed') * 100.0) / NULLIF(COUNT(t.id), 0), 1), 0)::float AS completion_percentage
  FROM users u
  LEFT JOIN tasks t ON t.owner_id = u.id
`;

async function listUserSummaries(filters) {
  const values = [];
  const where = userScope(filters, values);
  const limit = addParam(values, filters.limit);
  const offset = addParam(values, filters.offset);
  const result = await pool.query(`
    ${userSummarySelect}
    WHERE ${where}
    GROUP BY u.id
    ORDER BY u.is_active DESC, u.created_at ASC, u.login_id ASC
    LIMIT ${limit} OFFSET ${offset}
  `, values);
  return result.rows.map(serializeUserSummary);
}

export async function getOwnerOverview(filters) {
  const [globalResult, users] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*)::int AS total_users,
        COUNT(*) FILTER (WHERE is_active = TRUE)::int AS active_users,
        COUNT(*) FILTER (WHERE is_active = FALSE)::int AS inactive_users
      FROM users
    `),
    listUserSummaries(filters),
  ]);

  const taskResult = await pool.query(`
    SELECT
      COUNT(*)::int AS total_tasks,
      COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_tasks,
      COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_tasks,
      COUNT(*) FILTER (WHERE status = 'pending' AND deadline >= NOW() AND deadline <= NOW() + INTERVAL '3 days')::int AS urgent_tasks,
      COUNT(*) FILTER (WHERE status = 'pending' AND deadline < NOW())::int AS overdue_tasks,
      COALESCE(ROUND((COUNT(*) FILTER (WHERE status = 'completed') * 100.0) / NULLIF(COUNT(*), 0), 1), 0)::float AS completion_percentage
    FROM tasks
  `);

  return {
    users: globalResult.rows[0],
    tasks: taskResult.rows[0],
    userSummaries: users,
    filters,
  };
}

export async function getOwnerUserDetail(userId) {
  const result = await pool.query(`
    ${userSummarySelect}
    WHERE u.id = $1
    GROUP BY u.id
  `, [userId]);
  return result.rows[0] ? serializeUserSummary(result.rows[0]) : null;
}

export async function setUserActiveStatus(actor, userId, isActive) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const targetResult = await client.query(`
      SELECT id, role, is_active
      FROM users
      WHERE id = $1
      FOR UPDATE
    `, [userId]);
    const target = targetResult.rows[0];
    if (!target) throw new HttpError(404, 'USER_NOT_FOUND', 'Pengguna tidak ditemukan.');
    let activeOwnerCount = 0;
    if (target.role === 'owner' && target.is_active && !isActive) {
      await client.query("SELECT pg_advisory_xact_lock(834927151)");
      const ownerResult = await client.query("SELECT COUNT(*)::int AS active_owners FROM users WHERE role = 'owner' AND is_active = TRUE");
      activeOwnerCount = ownerResult.rows[0].active_owners;
    }
    assertOwnerStatusChange({ target, activeOwnerCount, actorUserId: actor.userId, isActive });

    const updated = await client.query(`
      UPDATE users
      SET is_active = $1, deactivated_at = CASE WHEN $1 THEN NULL ELSE COALESCE(deactivated_at, NOW()) END
      WHERE id = $2
      RETURNING id, role, is_active, deactivated_at
    `, [isActive, userId]);
    if (!isActive) await client.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
    await client.query('COMMIT');
    return updated.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
