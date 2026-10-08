const { syncEligibleQgJobs, qgCafiStartDate } = require('./qgModel');
const { malaysiaLocal, malaysiaDate } = require('./qgTimestampSql');

const todayInMalaysia = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

const dateRange = (filters) => {
  const from = filters.date_from || todayInMalaysia();
  const to = filters.date_to || from;
  if (!validDate(from) || !validDate(to) || from > to) {
    throw Object.assign(new Error('Choose a valid date range'), { status: 400 });
  }
  const taskType = String(filters.task_type || '').toUpperCase();
  if (taskType && !['FITMENT', 'HOIST'].includes(taskType)) {
    throw Object.assign(new Error('Choose a valid work type'), { status: 400 });
  }
  return { from, to, taskType: taskType || null };
};

const zeroRow = (taskType) => ({ task_type: taskType, inspected: 0, approved: 0, defect: 0, info: 0, pending: 0 });
const normalizeRows = (rows, countField, includeUnassigned = false) => (includeUnassigned ? ['FITMENT', 'HOIST', null] : ['FITMENT', 'HOIST']).map((taskType) => {
  const row = rows.find((item) => item.task_type === taskType) || {};
  return {
    ...zeroRow(taskType),
    [countField]: Number(row[countField] || 0),
    approved: Number(row.approved || 0),
    defect: Number(row.defect || 0),
    info: Number(row.info || 0),
    ...(countField === 'inspected' ? { pending: Number(row.pending || 0) } : {})
  };
});

const getOverview = async (req, filters = {}) => {
  const { from, to, taskType } = dateRange(filters);
  const db = req.app.get('pool');
  const canViewCa = ['supervisor', 'superadmin'].includes(String(req.user?.role || '').toLowerCase());
  await syncEligibleQgJobs(db);
  const [qgResult, pendingResult, caResult, trendResult, issueResult] = await Promise.all([
    db.query(`
      WITH first_result AS (
        SELECT DISTINCT ON (i.qg_job_id) i.qg_job_id, i.result, i.inspected_at
        FROM qg_inspection i
        WHERE i.voided_at IS NULL
        ORDER BY i.qg_job_id, i.inspected_at, i.id
      )
      SELECT j.task_type, COUNT(*)::int AS inspected,
        COUNT(*) FILTER (WHERE f.result = 'APPROVED')::int AS approved,
        COUNT(*) FILTER (WHERE f.result = 'DEFECT')::int AS defect
      FROM first_result f JOIN qg_job j ON j.id = f.qg_job_id
        JOIN masterlist m ON m.no = j.masterlist_id
      WHERE ${malaysiaDate('f.inspected_at')} BETWEEN $1::date AND $2::date
        AND ($3::text IS NULL OR j.task_type = $3)
        AND m.cafi_date::date >= $4::date
      GROUP BY j.task_type
    `, [from, to, taskType, qgCafiStartDate()]),
    db.query(`
      SELECT j.task_type, COUNT(*)::int AS pending
      FROM qg_job j JOIN masterlist m ON m.no = j.masterlist_id
      WHERE j.status = 'PENDING' AND m.cafi_date::date >= $1::date
        AND ($2::text IS NULL OR j.task_type = $2)
      GROUP BY j.task_type
    `, [qgCafiStartDate(), taskType]),
    canViewCa ? db.query(`
      WITH first_check AS (
        SELECT DISTINCT ON (case_id) case_id, checked_at
        FROM ca_line_check ORDER BY case_id, attempt_no, id
      ), latest_check AS (
        SELECT DISTINCT ON (case_id) case_id, result, checked_at
        FROM ca_line_check ORDER BY case_id, attempt_no DESC, id DESC
      )
      SELECT c.work_type AS task_type, COUNT(*)::int AS checked,
        COUNT(*) FILTER (WHERE l.result = 'APPROVED')::int AS approved,
        COUNT(*) FILTER (WHERE l.result = 'DEFECT')::int AS defect,
        COUNT(*) FILTER (WHERE l.result = 'INFO')::int AS info
      FROM ca_case c JOIN first_check f ON f.case_id = c.id
        JOIN latest_check l ON l.case_id = c.id
      WHERE (f.checked_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date
        BETWEEN $1::date AND $2::date
        AND ($3::text IS NULL OR c.work_type = $3)
      GROUP BY c.work_type
    `, [from, to, taskType]) : Promise.resolve({ rows: [] }),
    db.query(`
      WITH first_result AS (
        SELECT DISTINCT ON (i.qg_job_id) i.qg_job_id, i.inspected_at
        FROM qg_inspection i WHERE i.voided_at IS NULL
        ORDER BY i.qg_job_id, i.inspected_at, i.id
      )
      SELECT CASE WHEN $1::date = $2::date
          THEN TO_CHAR(${malaysiaLocal('f.inspected_at')}, 'HH24:00')
          ELSE TO_CHAR(${malaysiaLocal('f.inspected_at')}, 'YYYY-MM-DD') END AS bucket,
        j.task_type, COUNT(*)::int AS count
      FROM first_result f JOIN qg_job j ON j.id = f.qg_job_id
        JOIN masterlist m ON m.no = j.masterlist_id
      WHERE ${malaysiaDate('f.inspected_at')} BETWEEN $1::date AND $2::date
        AND ($3::text IS NULL OR j.task_type = $3)
        AND m.cafi_date::date >= $4::date
      GROUP BY bucket, j.task_type ORDER BY bucket, j.task_type
    `, [from, to, taskType, qgCafiStartDate()]),
    db.query(`
      WITH first_result AS (
        SELECT DISTINCT ON (i.qg_job_id) i.id, i.qg_job_id, i.inspected_at
        FROM qg_inspection i WHERE i.voided_at IS NULL
        ORDER BY i.qg_job_id, i.inspected_at, i.id
      )
      SELECT dimension.category, dimension.id, dimension.name,
        COUNT(*)::int AS count
      FROM first_result f JOIN qg_job j ON j.id = f.qg_job_id
        JOIN masterlist m ON m.no = j.masterlist_id
        JOIN qg_inspection_defect d ON d.inspection_id = f.id
        LEFT JOIN qg_defect_issue issue ON issue.id = d.issue_id
        LEFT JOIN qg_defect_option description ON description.id = d.description_id
        LEFT JOIN qg_defect_option area ON area.id = d.area_id
        CROSS JOIN LATERAL (VALUES
          ('type', d.issue_id, COALESCE(NULLIF(BTRIM(d.issue_name), ''), issue.name)),
          ('description', d.description_id, COALESCE(NULLIF(BTRIM(d.description_name), ''), description.name)),
          ('area', d.area_id, COALESCE(NULLIF(BTRIM(d.area_name), ''), area.name))
        ) AS dimension(category, id, name)
      WHERE ${malaysiaDate('f.inspected_at')} BETWEEN $1::date AND $2::date
        AND ($3::text IS NULL OR j.task_type = $3)
        AND m.cafi_date::date >= $4::date
        AND dimension.name IS NOT NULL
      GROUP BY dimension.category, dimension.id, dimension.name
      ORDER BY count DESC, dimension.name ASC, dimension.id ASC
    `, [from, to, taskType, qgCafiStartDate()])
  ]);

  const breakdown = await db.query(`
    WITH first_result AS (
      SELECT DISTINCT ON (qg_job_id) id, qg_job_id, result, inspected_at, inspected_by
      FROM qg_inspection WHERE voided_at IS NULL
      ORDER BY qg_job_id, inspected_at, id
    ), scoped AS (
      SELECT i.id, i.result, i.inspected_by AS inspector_id,
        COALESCE(a.username, 'Unknown inspector') AS inspector, b.no AS bay_id, b.name AS bay,
        CASE WHEN UPPER(LEFT(TRIM(m.fitment_id), 1)) IN ('V', 'A', 'J')
          THEN UPPER(LEFT(TRIM(m.fitment_id), 1)) ELSE 'Other' END AS vehicle_type,
        (SELECT COUNT(*)::int FROM qg_inspection_defect d WHERE d.inspection_id = i.id) AS findings
      FROM first_result i
      JOIN qg_job j ON j.id = i.qg_job_id
      JOIN masterlist m ON m.no = j.masterlist_id
      LEFT JOIN admins a ON a.id = i.inspected_by
      LEFT JOIN checkin c ON c.no = j.source_checkin_id
      LEFT JOIN bay b ON b.no = c.bay_id
      WHERE m.cafi_date::date >= $4::date
        AND ${malaysiaDate('i.inspected_at')} BETWEEN $1::date AND $2::date
        AND ($3::text IS NULL OR j.task_type = $3)
    ), inspector_vehicles AS (
      SELECT DISTINCT i.inspected_by AS inspector_id,
        COALESCE(a.username, 'Unknown inspector') AS inspector,
        m.no AS vehicle_id, UPPER(LEFT(TRIM(m.fitment_id), 1)) AS vehicle_type
      FROM qg_inspection i
      JOIN qg_job j ON j.id = i.qg_job_id
      JOIN masterlist m ON m.no = j.masterlist_id
      LEFT JOIN admins a ON a.id = i.inspected_by
      WHERE i.voided_at IS NULL AND m.cafi_date::date >= $4::date
        AND ${malaysiaDate('i.inspected_at')} BETWEEN $1::date AND $2::date
        AND ($3::text IS NULL OR j.task_type = $3)
    )
    SELECT
      (SELECT jsonb_build_object('completed', COUNT(*)::int,
        'defect_count', COALESCE(SUM(findings), 0)::int) FROM scoped) AS quality_summary,
      COALESCE((SELECT jsonb_agg(s ORDER BY completed DESC, inspector, inspector_id) FROM (
        SELECT inspector_id, inspector, COUNT(*)::int AS completed,
          COUNT(*) FILTER (WHERE result = 'APPROVED')::int AS approved,
          COUNT(*) FILTER (WHERE result = 'DEFECT')::int AS defect,
          SUM(findings)::int AS defect_count
        FROM scoped GROUP BY inspector_id, inspector
      ) s), '[]'::jsonb) AS inspector_summary,
      COALESCE((SELECT jsonb_agg(v ORDER BY inspector, inspector_id) FROM (
        SELECT inspector_id, inspector,
          COUNT(*) FILTER (WHERE vehicle_type = 'V')::int AS v,
          COUNT(*) FILTER (WHERE vehicle_type = 'A')::int AS a,
          COUNT(*) FILTER (WHERE vehicle_type = 'J')::int AS j
        FROM inspector_vehicles GROUP BY inspector_id, inspector
      ) v), '[]'::jsonb) AS inspector_vehicle_types,
      COALESCE((SELECT jsonb_agg(v ORDER BY vehicle_type) FROM (
        SELECT vehicle_type, COUNT(*)::int AS completed,
          COUNT(*) FILTER (WHERE result = 'APPROVED')::int AS approved,
          COUNT(*) FILTER (WHERE result = 'DEFECT')::int AS defect
        FROM scoped GROUP BY vehicle_type
      ) v), '[]'::jsonb) AS vehicle_types,
      COALESCE((SELECT jsonb_agg(b ORDER BY defect_count DESC, bay) FROM (
        SELECT bay_id, bay, COUNT(*)::int AS completed,
          COUNT(*) FILTER (WHERE result = 'DEFECT')::int AS defect,
          SUM(findings)::int AS defect_count
        FROM scoped GROUP BY bay_id, bay
      ) b), '[]'::jsonb) AS defects_by_bay
  `, [from, to, taskType, qgCafiStartDate()]);

  const pendingByType = new Map(pendingResult.rows.map((row) => [row.task_type, Number(row.pending)]));
  const qg = normalizeRows(qgResult.rows, 'inspected').map((row) => ({
    ...row, pending: pendingByType.get(row.task_type) || 0
  }));
  const ca = normalizeRows(caResult.rows, 'checked', caResult.rows.some((row) => row.task_type === null));
  return {
    date_from: from, date_to: to, task_type: taskType, ca_available: canViewCa,
    qg, ca,
    quality_summary: breakdown.rows[0]?.quality_summary || { completed: 0, defect_count: 0 },
    inspector_summary: breakdown.rows[0]?.inspector_summary || [],
    inspector_vehicle_types: breakdown.rows[0]?.inspector_vehicle_types || [],
    vehicle_types: breakdown.rows[0]?.vehicle_types || [],
    defects_by_bay: breakdown.rows[0]?.defects_by_bay || [],
    defect_issues: issueResult.rows.filter((row) => row.category === 'type')
      .map((row) => ({ id: Number(row.id), issue: row.name, count: Number(row.count) })),
    defect_descriptions: issueResult.rows.filter((row) => row.category === 'description')
      .map((row) => ({ id: Number(row.id), name: row.name, count: Number(row.count) })),
    defect_areas: issueResult.rows.filter((row) => row.category === 'area')
      .map((row) => ({ id: Number(row.id), name: row.name, count: Number(row.count) })),
    trend: trendResult.rows.map((row) => ({ bucket: row.bucket, task_type: row.task_type, count: Number(row.count) })),
    generated_at: new Date().toISOString()
  };
};

module.exports = { getOverview, dateRange };
