import { pool } from '../db/pool.js';

const taskSelect = `
  SELECT
    t.id,
    t.owner_id,
    u.login_id AS owner_login_id,
    u.nickname AS owner_nickname,
    t.title,
    t.description,
    t.task_type,
    t.status,
    t.deadline,
    t.completed_at,
    t.created_at,
    t.updated_at,
    (t.status = 'pending' AND t.deadline < NOW()) AS is_overdue,
    (t.status = 'pending' AND t.deadline >= NOW() AND t.deadline <= NOW() + INTERVAL '3 days') AS is_urgent,
    EXTRACT(EPOCH FROM (t.deadline - NOW())) AS seconds_to_deadline
  FROM tasks t
  INNER JOIN users u ON u.id = t.owner_id
`;

function serializeTask(row) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    ownerLoginId: row.owner_login_id,
    ownerNickname: row.owner_nickname,
    title: row.title,
    description: row.description,
    taskType: row.task_type,
    status: row.status,
    deadline: new Date(row.deadline).toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    isOverdue: Boolean(row.is_overdue),
    isUrgent: Boolean(row.is_urgent),
    secondsToDeadline: Number(row.seconds_to_deadline),
  };
}

function addParam(values, value) {
  values.push(value);
  return `$${values.length}`;
}

function scopeClauses(auth, values, ownerId = null) {
  const clauses = [];
  if (auth.role !== 'owner') {
    clauses.push(`t.owner_id = ${addParam(values, auth.userId)}`);
  } else if (ownerId) {
    clauses.push(`t.owner_id = ${addParam(values, ownerId)}`);
  }
  return clauses;
}

function flagClause(flag) {
  if (flag === 'overdue') return "(t.status = 'pending' AND t.deadline < NOW())";
  if (flag === 'urgent') return "(t.status = 'pending' AND t.deadline >= NOW() AND t.deadline <= NOW() + INTERVAL '3 days')";
  return null;
}

function orderClause(sort) {
  return {
    deadline_asc: 't.deadline ASC, t.created_at DESC',
    deadline_desc: 't.deadline DESC, t.created_at DESC',
    created_asc: 't.created_at ASC',
    created_desc: 't.created_at DESC',
  }[sort] ?? 't.deadline ASC, t.created_at DESC';
}

export async function listTasks(auth, filters) {
  const values = [];
  const clauses = scopeClauses(auth, values, auth.role === 'owner' ? filters.ownerId : null);
  if (filters.search) clauses.push(`t.title ILIKE ${addParam(values, `%${filters.search}%`)}`);
  if (filters.taskType) clauses.push(`t.task_type = ${addParam(values, filters.taskType)}`);
  if (filters.status) clauses.push(`t.status = ${addParam(values, filters.status)}`);
  if (filters.deadlineFrom) clauses.push(`t.deadline >= ${addParam(values, filters.deadlineFrom)}::timestamptz`);
  if (filters.deadlineTo) clauses.push(`t.deadline <= ${addParam(values, filters.deadlineTo)}::timestamptz`);
  const flag = flagClause(filters.flag);
  if (flag) clauses.push(flag);

  const limitParam = addParam(values, filters.limit);
  const offsetParam = addParam(values, filters.offset);
  const result = await pool.query(`
    ${taskSelect}
    WHERE ${clauses.length > 0 ? clauses.join(' AND ') : 'TRUE'}
    ORDER BY ${orderClause(filters.sort)}
    LIMIT ${limitParam} OFFSET ${offsetParam}
  `, values);

  return result.rows.map(serializeTask);
}

export async function findTask(auth, taskId) {
  const values = [taskId];
  const clauses = ['t.id = $1', ...scopeClauses(auth, values)];
  const result = await pool.query(`
    ${taskSelect}
    WHERE ${clauses.join(' AND ')}
    LIMIT 1
  `, values);
  return result.rows[0] ? serializeTask(result.rows[0]) : null;
}

export async function summarizeTasks(auth) {
  const values = [];
  const clauses = scopeClauses(auth, values);
  const result = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE t.status = 'completed')::int AS completed,
      COUNT(*) FILTER (WHERE t.status = 'pending')::int AS pending,
      COUNT(*) FILTER (WHERE t.status = 'pending' AND t.deadline < NOW())::int AS overdue,
      COUNT(*) FILTER (WHERE t.status = 'pending' AND t.deadline >= NOW() AND t.deadline <= NOW() + INTERVAL '3 days')::int AS urgent,
      COALESCE(ROUND((COUNT(*) FILTER (WHERE t.status = 'completed') * 100.0) / NULLIF(COUNT(*), 0), 1), 0)::float AS completion_percentage
    FROM tasks t
    WHERE ${clauses.length > 0 ? clauses.join(' AND ') : 'TRUE'}
  `, values);
  return result.rows[0];
}

export async function createTask(auth, values) {
  const result = await pool.query(`
    INSERT INTO tasks (owner_id, title, description, task_type, status, deadline)
    VALUES ($1, $2, $3, $4, 'pending', $5)
    RETURNING id
  `, [auth.userId, values.title, values.description, values.taskType, values.deadline]);
  return findTask(auth, result.rows[0].id);
}

export async function updateTask(auth, taskId, values) {
  const assignments = [];
  const params = [taskId];
  if (Object.prototype.hasOwnProperty.call(values, 'title')) assignments.push(`title = $${params.push(values.title)}`);
  if (Object.prototype.hasOwnProperty.call(values, 'description')) assignments.push(`description = $${params.push(values.description)}`);
  if (Object.prototype.hasOwnProperty.call(values, 'taskType')) assignments.push(`task_type = $${params.push(values.taskType)}`);
  if (Object.prototype.hasOwnProperty.call(values, 'deadline')) assignments.push(`deadline = $${params.push(values.deadline)}`);
  if (Object.prototype.hasOwnProperty.call(values, 'status')) {
    const statusParam = params.push(values.status);
    assignments.push(`status = $${statusParam}::varchar`);
    assignments.push(`completed_at = CASE WHEN $${statusParam}::varchar = 'completed' THEN COALESCE(completed_at, NOW()) ELSE NULL END`);
  }
  if (assignments.length === 0) return findTask(auth, taskId);

  const scope = scopeClauses(auth, params);
  const result = await pool.query(`
    UPDATE tasks t
    SET ${assignments.join(', ')}
    WHERE t.id = $1 ${scope.length > 0 ? `AND ${scope.join(' AND ')}` : ''}
    RETURNING t.id
  `, params);
  if (result.rowCount === 0) return null;
  return findTask(auth, result.rows[0].id);
}

export async function deleteTask(auth, taskId) {
  const values = [taskId];
  const scope = scopeClauses(auth, values);
  const result = await pool.query(`
    DELETE FROM tasks t
    WHERE t.id = $1 ${scope.length > 0 ? `AND ${scope.join(' AND ')}` : ''}
    RETURNING t.id
  `, values);
  return result.rowCount > 0;
}
