const { instant } = require('./qgTimestampSql');
const { getCase } = require('./caLineCheckModel');
const { getInspectionDetail, qgCafiStartDate } = require('./qgModel');

const validType = (value) => ['FITMENT', 'HOIST'].includes(String(value || '').trim().toUpperCase());
const keyFor = (id, type) => `${id}:${String(type).trim().toUpperCase()}`;

// A CA case may have been entered manually before it was linked to a masterlist row.
// Match those cases by the recorded vehicle identity, but never cross work types.
const caMatch = `(c.work_type = k.task_type OR (c.work_type IS NULL AND c.masterlist_id = k.masterlist_id)) AND (
  c.masterlist_id = k.masterlist_id OR (
    c.masterlist_id IS NULL AND (
      (NULLIF(BTRIM(c.fitment_id), '') IS NOT NULL AND LOWER(BTRIM(c.fitment_id)) = LOWER(BTRIM(m.fitment_id))) OR
      (NULLIF(BTRIM(c.fitment_id), '') IS NULL AND NULLIF(BTRIM(c.chassis), '') IS NOT NULL
        AND LOWER(BTRIM(c.chassis)) = LOWER(BTRIM(m.chassis)))
    )
  )
)`;

const getTaskInspectionSummaries = async (req, rows) => {
  const keys = [...new Map(rows.filter((row) => row.no && validType(row.type))
    .map((row) => [keyFor(row.no, row.type), { id: Number(row.no), type: String(row.type).trim().toUpperCase() }])).values()];
  if (!keys.length) return rows;
  const values = [keys.map((key) => key.id), keys.map((key) => key.type)];
  const db = req.app.get('pool');
  const [ca, qg] = await Promise.all([
    db.query(`
      WITH k AS (SELECT * FROM UNNEST($1::bigint[], $2::text[]) AS x(masterlist_id, task_type))
      SELECT DISTINCT ON (k.masterlist_id, k.task_type)
        k.masterlist_id, k.task_type, c.id AS case_id, ch.result, ch.checked_at AS performed_at,
        ch.attempt_no
      FROM k JOIN masterlist m ON m.no = k.masterlist_id
      JOIN ca_case c ON ${caMatch}
      JOIN LATERAL (
        SELECT result, checked_at, recorded_at, attempt_no FROM ca_line_check
        WHERE case_id = c.id ORDER BY attempt_no DESC LIMIT 1
      ) ch ON TRUE
      ORDER BY k.masterlist_id, k.task_type, ch.recorded_at DESC, c.id DESC
    `, values),
    db.query(`
      WITH k AS (SELECT * FROM UNNEST($1::bigint[], $2::text[]) AS x(masterlist_id, task_type))
      SELECT k.masterlist_id, k.task_type, j.id AS job_id, j.status,
        i.id AS inspection_id, i.result, ${instant('i.inspected_at')} AS performed_at, i.attempt_no
      FROM k JOIN masterlist m ON m.no = k.masterlist_id
      JOIN qg_job j ON j.masterlist_id = k.masterlist_id AND j.task_type = k.task_type
      LEFT JOIN qg_inspection i ON i.id = j.latest_inspection_id AND i.voided_at IS NULL
      WHERE m.cafi_date::date >= $3::date
    `, [...values, qgCafiStartDate()])
  ]);
  const caByKey = new Map(ca.rows.map((row) => [keyFor(row.masterlist_id, row.task_type), row]));
  const qgByKey = new Map(qg.rows.map((row) => [keyFor(row.masterlist_id, row.task_type), row]));
  return rows.map((row) => ({ ...row,
    ca_result: caByKey.get(keyFor(row.no, row.type))?.result || null,
    qg_result: qgByKey.get(keyFor(row.no, row.type))?.result || null,
    qg_status: qgByKey.get(keyFor(row.no, row.type))?.status || null
  }));
};

const getTaskInspectionDetails = async (req, masterlistId, taskType) => {
  if (!masterlistId || !validType(taskType)) return { ca: [], qg: [], qg_status: null };
  const db = req.app.get('pool');
  const values = [Number(masterlistId), String(taskType).trim().toUpperCase()];
  const [caCases, qgJobs] = await Promise.all([
    db.query(`
      WITH k AS (SELECT $1::bigint AS masterlist_id, $2::text AS task_type)
      SELECT DISTINCT c.id FROM k JOIN masterlist m ON m.no = k.masterlist_id
      JOIN ca_case c ON ${caMatch}
      ORDER BY c.id DESC
    `, values),
    db.query(`
      SELECT j.status, i.id AS inspection_id FROM qg_job j
      JOIN masterlist m ON m.no = j.masterlist_id
      LEFT JOIN qg_inspection i ON i.qg_job_id = j.id AND i.voided_at IS NULL
      WHERE j.masterlist_id = $1 AND j.task_type = $2
        AND m.cafi_date::date >= $3::date
      ORDER BY i.attempt_no DESC
    `, [...values, qgCafiStartDate()])
  ]);
  const [ca, qg] = await Promise.all([
    Promise.all(caCases.rows.map((row) => getCase(req, row.id))),
    Promise.all(qgJobs.rows.filter((row) => row.inspection_id)
      .map((row) => getInspectionDetail(req, row.inspection_id)))
  ]);
  return { ca: ca.filter(Boolean), qg: qg.filter(Boolean), qg_status: qgJobs.rows[0]?.status || null };
};

module.exports = { getTaskInspectionSummaries, getTaskInspectionDetails };
