import { pool } from '../db/pool.js';

function number(value) { return Number(value ?? 0); }

function scopedClause(auth, values, alias = 't') {
  if (auth.role !== 'owner') {
    values.push(auth.userId);
    return ` AND ${alias}.owner_id = $${values.length}`;
  }
  return '';
}

function periodInterval(mode) {
  return mode === 'daily' ? '1 hour' : '1 day';
}

function serializeSummary(row) {
  return {
    snapshotAt: new Date(row.snapshot_at).toISOString(),
    totalTasks: number(row.total_tasks),
    completedTasks: number(row.completed_tasks),
    pendingTasks: number(row.pending_tasks),
    urgentTasks: number(row.urgent_tasks),
    overdueTasks: number(row.overdue_tasks),
    completionPercentage: number(row.completion_percentage),
    createdInPeriod: number(row.created_in_period),
    completedInPeriod: number(row.completed_in_period),
    periodCompletionPercentage: number(row.period_completion_percentage),
  };

}

export async function getReport(auth, period) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    const snapshotResult = await client.query('SELECT NOW() AS snapshot_at');
    const snapshotAt = snapshotResult.rows[0].snapshot_at;

    const summaryValues = [period.start, period.end, snapshotAt];
    const summaryScope = scopedClause(auth, summaryValues);
    const summaryResult = await client.query(`
      SELECT
        $3::timestamptz AS snapshot_at,
        COUNT(t.id)::int AS total_tasks,
        COUNT(t.id) FILTER (WHERE t.status = 'completed')::int AS completed_tasks,
        COUNT(t.id) FILTER (WHERE t.status = 'pending')::int AS pending_tasks,
        COUNT(t.id) FILTER (WHERE t.status = 'pending' AND t.deadline >= $3::timestamptz AND t.deadline <= $3::timestamptz + INTERVAL '3 days')::int AS urgent_tasks,
        COUNT(t.id) FILTER (WHERE t.status = 'pending' AND t.deadline < $3::timestamptz)::int AS overdue_tasks,
        COALESCE(ROUND((COUNT(t.id) FILTER (WHERE t.status = 'completed') * 100.0) / NULLIF(COUNT(t.id), 0), 1), 0)::float AS completion_percentage,
        COUNT(t.id) FILTER (WHERE t.created_at >= $1::timestamptz AND t.created_at < $2::timestamptz)::int AS created_in_period,
        COUNT(t.id) FILTER (WHERE t.completed_at >= $1::timestamptz AND t.completed_at < $2::timestamptz)::int AS completed_in_period,
        COALESCE(ROUND((COUNT(t.id) FILTER (WHERE t.completed_at >= $1::timestamptz AND t.completed_at < $2::timestamptz) * 100.0) / NULLIF(COUNT(t.id) FILTER (WHERE t.created_at >= $1::timestamptz AND t.created_at < $2::timestamptz), 0), 1), 0)::float AS period_completion_percentage
      FROM (SELECT 1) AS basis
      LEFT JOIN tasks t ON t.created_at <= $3::timestamptz${summaryScope}
    `, summaryValues);

    const interval = periodInterval(period.mode);
    const trendValues = [period.start, period.end, interval, snapshotAt];
    const trendScope = scopedClause(auth, trendValues);
    const trendResult = await client.query(`
      WITH buckets AS (
        SELECT generate_series(
          $1::timestamptz,
          $2::timestamptz - $3::interval,
          $3::interval
        ) AS bucket
      )
      SELECT
        buckets.bucket,
        COUNT(t.id) FILTER (WHERE t.created_at >= buckets.bucket AND t.created_at < buckets.bucket + $3::interval)::int AS created,
        COUNT(t.id) FILTER (WHERE t.completed_at >= buckets.bucket AND t.completed_at < buckets.bucket + $3::interval)::int AS completed
      FROM buckets
      LEFT JOIN tasks t
        ON t.created_at <= $4::timestamptz
        AND ((t.created_at >= $1::timestamptz AND t.created_at < $2::timestamptz)
          OR (t.completed_at >= $1::timestamptz AND t.completed_at < $2::timestamptz))${trendScope}
      GROUP BY buckets.bucket
      ORDER BY buckets.bucket
    `, trendValues);

    let comparison = [];
    if (auth.role === 'owner') {
      const comparisonValues = [period.start, period.end, snapshotAt];
      const comparisonResult = await client.query(`
        SELECT
          u.id,
          u.login_id,
          u.nickname,
          u.role,
          u.is_active,
          COUNT(t.id) FILTER (WHERE t.created_at >= $1::timestamptz AND t.created_at < $2::timestamptz)::int AS created_in_period,
          COUNT(t.id) FILTER (WHERE t.completed_at >= $1::timestamptz AND t.completed_at < $2::timestamptz)::int AS completed_in_period,
          COUNT(t.id)::int AS total_tasks,
          COALESCE(ROUND((COUNT(t.id) FILTER (WHERE t.completed_at >= $1::timestamptz AND t.completed_at < $2::timestamptz) * 100.0) / NULLIF(COUNT(t.id) FILTER (WHERE t.created_at >= $1::timestamptz AND t.created_at < $2::timestamptz), 0), 1), 0)::float AS period_completion_percentage
        FROM users u
        LEFT JOIN tasks t ON t.owner_id = u.id AND t.created_at <= $3::timestamptz
        GROUP BY u.id
        ORDER BY completed_in_period DESC, created_in_period DESC, u.login_id ASC
      `, comparisonValues);
      comparison = comparisonResult.rows.map((row) => ({
        id: row.id,
        loginId: row.login_id,
        nickname: row.nickname,
        role: row.role,
        isActive: Boolean(row.is_active),
        createdInPeriod: number(row.created_in_period),
        completedInPeriod: number(row.completed_in_period),
        totalTasks: number(row.total_tasks),
        periodCompletionPercentage: number(row.period_completion_percentage),
      }));
    }

    await client.query('COMMIT');
    return {
      period: {
        mode: period.mode,
        value: period.value,
        start: period.start,
        end: period.end,
        label: period.label,
      },
      summary: serializeSummary(summaryResult.rows[0]),
      trend: trendResult.rows.map((row) => ({
        bucket: new Date(row.bucket).toISOString(),
        created: number(row.created),
        completed: number(row.completed),
      })),
      comparison,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
