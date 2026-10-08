const { latestAuditSql } = require('./auditSummarySql');
const { verifyPhoto } = require('../../../../utils/qgPhoto');
const { getSignedReadUrl } = require('../../../../utils/s3Upload');
const { instant, installationInstant, malaysiaDate } = require('./qgTimestampSql');
const normalizeDate = (value, fallback) => {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : fallback;
};

const QG_DEFAULT_CAFI_START_DATE = '2026-09-28';
const qgCafiStartDate = () => /^\d{4}-\d{2}-\d{2}$/.test(String(process.env.QG_CAFI_START_DATE || ''))
  ? process.env.QG_CAFI_START_DATE
  : QG_DEFAULT_CAFI_START_DATE;
const inspectionOwnerId = (req) => String(req.user?.role || '').toLowerCase() === 'qg'
  ? req.user.id
  : null;

const syncEligibleQgJobs = async (db, masterlistId = null) => {
  const cafiStartDate = qgCafiStartDate();
  const query = `
    WITH ignored_jobs AS (
      DELETE FROM qg_job j
      USING masterlist m
      WHERE m.no = j.masterlist_id
        AND m.cafi_date::date < $1::date
        AND ($2::bigint IS NULL OR j.masterlist_id = $2::bigint)
        AND NOT EXISTS (SELECT 1 FROM qg_inspection i WHERE i.qg_job_id = j.id)
      RETURNING j.id
    ),
    required_types AS (
      SELECT DISTINCT ti.masterlist_id, TRIM(ti.type) AS task_type
      FROM task_item ti
      JOIN masterlist m ON m.no = ti.masterlist_id
      WHERE TRIM(ti.type) IN ('FITMENT', 'HOIST')
        AND ($2::bigint IS NULL OR ti.masterlist_id = $2::bigint)
        AND m.cancel_time IS NULL
        AND m.cafi_date::date >= $1::date
    ),
    latest_checkin AS (
      SELECT DISTINCT ON (masterlist_id, TRIM(type))
        no,
        masterlist_id,
        TRIM(type) AS task_type,
        status,
        COALESCE(checkin_time, created_at + INTERVAL '8 hours') AS checkin_at
      FROM checkin
      WHERE TRIM(type) IN ('FITMENT', 'HOIST')
        AND ($2::bigint IS NULL OR masterlist_id = $2::bigint)
      ORDER BY masterlist_id, TRIM(type), no DESC
    ),
    checked_in AS (
      SELECT no, masterlist_id, task_type, checkin_at
      FROM latest_checkin
      WHERE status IN ('Check-In', 'Check-Out')
    )
    INSERT INTO qg_job (
      masterlist_id,
      task_type,
      source_checkin_id,
      status,
      available_at
    )
    SELECT
      r.masterlist_id,
      r.task_type,
      c.no,
      'PENDING',
      c.checkin_at
    FROM required_types r
    JOIN checked_in c
      ON c.masterlist_id = r.masterlist_id
     AND c.task_type = r.task_type
    ON CONFLICT (masterlist_id, task_type) DO UPDATE
      SET source_checkin_id = EXCLUDED.source_checkin_id,
          status = EXCLUDED.status,
          available_at = EXCLUDED.available_at,
          updated_at = CURRENT_TIMESTAMP
      WHERE qg_job.status = 'PENDING'
        AND (qg_job.source_checkin_id IS DISTINCT FROM EXCLUDED.source_checkin_id
          OR qg_job.status IS DISTINCT FROM EXCLUDED.status
          OR qg_job.available_at IS DISTINCT FROM EXCLUDED.available_at)
    RETURNING id
  `;
  const result = await db.query(query, [cafiStartDate, masterlistId]);
  return result.rows;
};

const listPendingJobs = async (req) => {
  const db = req.app.get('pool');
  await syncEligibleQgJobs(db);
  const result = await db.query(`
    SELECT j.id AS job_id, j.task_type, ${installationInstant('j.available_at')} AS available_at,
      m.chassis, m.fitment_id, m.model_description,
      b.name AS bay
    FROM qg_job j
    JOIN masterlist m ON m.no = j.masterlist_id
    JOIN checkin c ON c.no = j.source_checkin_id
    LEFT JOIN bay b ON b.no = c.bay_id
    WHERE j.status = 'PENDING'
      AND m.cafi_date::date >= $1::date
    ORDER BY j.available_at DESC, j.id DESC
  `, [qgCafiStartDate()]);
  return result.rows;
};

const getDashboard = async (req, filters = {}) => {
  const db = req.app.get('pool');
  await syncEligibleQgJobs(db);
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  const dateFrom = normalizeDate(filters.date_from, today);
  const dateTo = normalizeDate(filters.date_to, dateFrom);
  const ownerId = inspectionOwnerId(req);

  const summary = await db.query(`
    SELECT
      (SELECT COUNT(*)::int FROM qg_job j
        JOIN masterlist m ON m.no = j.masterlist_id
        WHERE j.status = 'PENDING' AND m.cafi_date::date >= $4::date) AS pending,
      COUNT(*)::int AS completed,
      COUNT(*) FILTER (WHERE result = 'APPROVED')::int AS approved,
      COUNT(*) FILTER (WHERE result = 'DEFECT')::int AS defect
    FROM qg_inspection i
    JOIN qg_job j ON j.id = i.qg_job_id
    JOIN masterlist m ON m.no = j.masterlist_id
    WHERE i.voided_at IS NULL
      AND m.cafi_date::date >= $4::date
      AND ${malaysiaDate('i.inspected_at')}
          BETWEEN $1::date AND $2::date
      AND ($3::bigint IS NULL OR i.inspected_by = $3::bigint)
  `, [dateFrom, dateTo, ownerId, qgCafiStartDate()]);

  const recent = await db.query(`
    SELECT
      i.id,
      i.result,
      ${instant('i.inspected_at')} AS inspected_at,
      j.task_type,
      m.chassis,
      m.fitment_id,
      m.model_description,
      a.username AS inspector, ${latestAuditSql('i.qg_job_id')} AS audit,
      COUNT(d.id)::int AS defect_count
    FROM qg_inspection i
    JOIN qg_job j ON j.id = i.qg_job_id
    JOIN masterlist m ON m.no = j.masterlist_id
    JOIN admins a ON a.id = i.inspected_by
    LEFT JOIN qg_inspection_defect d ON d.inspection_id = i.id
    WHERE i.voided_at IS NULL
      AND m.cafi_date::date >= $4::date
      AND ${malaysiaDate('i.inspected_at')} BETWEEN $1::date AND $2::date
      AND ($3::bigint IS NULL OR i.inspected_by = $3::bigint)
    GROUP BY i.id, j.task_type, m.chassis, m.fitment_id, m.model_description, a.username
    ORDER BY i.inspected_at DESC
    LIMIT 8
  `, [dateFrom, dateTo, ownerId, qgCafiStartDate()]);

  // Aggregate the full reporting period, independently of the recent activity limit.
  const breakdown = await db.query(`
    WITH scoped AS (
      SELECT i.id, i.result, i.inspected_by AS inspector_id,
        COALESCE(a.username, 'Unknown inspector') AS inspector, b.no AS bay_id, b.name AS bay,
        CASE WHEN UPPER(LEFT(TRIM(m.fitment_id), 1)) IN ('V', 'A', 'J')
          THEN UPPER(LEFT(TRIM(m.fitment_id), 1)) ELSE 'Other' END AS vehicle_type,
        (SELECT COUNT(*)::int FROM qg_inspection_defect d WHERE d.inspection_id = i.id) AS findings
      FROM qg_inspection i
      JOIN qg_job j ON j.id = i.qg_job_id
      JOIN masterlist m ON m.no = j.masterlist_id
      LEFT JOIN admins a ON a.id = i.inspected_by
      LEFT JOIN checkin c ON c.no = j.source_checkin_id
      LEFT JOIN bay b ON b.no = c.bay_id
      WHERE i.voided_at IS NULL AND m.cafi_date::date >= $4::date
        AND ${malaysiaDate('i.inspected_at')} BETWEEN $1::date AND $2::date
        AND ($3::bigint IS NULL OR i.inspected_by = $3::bigint)
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
        AND ($3::bigint IS NULL OR i.inspected_by = $3::bigint)
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
  `, [dateFrom, dateTo, ownerId, qgCafiStartDate()]);

  const row = summary.rows[0] || {};
  const completed = Number(row.completed || 0);
  const approved = Number(row.approved || 0);
  return {
    pending: Number(row.pending || 0),
    completed,
    approved,
    defect: Number(row.defect || 0),
    approval_rate: completed ? Number(((approved / completed) * 100).toFixed(2)) : 0,
    date_from: dateFrom,
    date_to: dateTo,
    timezone: 'Asia/Kuala_Lumpur',
    quality_summary: breakdown.rows[0]?.quality_summary || { completed: 0, defect_count: 0 },
    inspector_summary: breakdown.rows[0]?.inspector_summary || [],
    inspector_vehicle_types: breakdown.rows[0]?.inspector_vehicle_types || [],
    vehicle_types: breakdown.rows[0]?.vehicle_types || [],
    defects_by_bay: breakdown.rows[0]?.defects_by_bay || [],
    recent: recent.rows
  };
};

const resolveScan = async (req, scanValue) => {
  const db = req.app.get('pool');
  await syncEligibleQgJobs(db);
  const value = String(scanValue || '').trim();
  const result = await db.query(`
    SELECT
      m.no AS masterlist_id,
      m.chassis,
      m.fitment_id,
      m.seq,
      m.model_code,
      m.model_description,
      m.colour,
      m.cafi_date,
      jsonb_agg(
        jsonb_build_object(
          'job_id', j.id,
          'task_type', j.task_type,
          'status', j.status,
          'available_at', ${installationInstant('j.available_at')},
          'bay', b.name,
          'staff', COALESCE(st.staff, '[]'::jsonb)
        ) ORDER BY j.task_type
      ) AS work_types
    FROM masterlist m
    JOIN qg_job j ON j.masterlist_id = m.no AND j.status <> 'VOID'
    JOIN checkin c ON c.no = j.source_checkin_id
    LEFT JOIN bay b ON b.no = c.bay_id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(DISTINCT jsonb_build_object(
        'id', s.no,
        'name', s.name,
        'staff_id', s.staff_id
      )) AS staff
      FROM checkin_staff cs
      JOIN staff s ON s.no = cs.staff_id
      WHERE cs.checkin_id = c.no
    ) st ON TRUE
    WHERE LOWER(TRIM(m.fitment_id)) = LOWER($1)
      AND m.cafi_date::date >= $2::date
    GROUP BY m.no
    ORDER BY m.no
    LIMIT 2
  `, [value, qgCafiStartDate()]);
  return result.rows;
};

const getJobDetail = async (req, jobId) => {
  const result = await req.app.get('pool').query(`
    SELECT
      j.id AS job_id,
      j.status AS qg_status, ${latestAuditSql('j.id')} AS audit,
      j.task_type,
      ${installationInstant('j.available_at')} AS available_at,
      m.no AS masterlist_id,
      m.chassis,
      m.fitment_id,
      m.seq,
      m.model_code,
      m.model_description,
      m.colour,
      m.cafi_date,
      ${installationInstant("COALESCE(c.checkin_time, c.created_at + INTERVAL '8 hours')")} AS checkin_time,
      ${installationInstant('c.checkout_time')} AS checkout_time,
      c.remark AS cardio_remark,
      b.name AS bay,
      COALESCE(st.staff, '[]'::jsonb) AS staff,
      COALESCE(items.items, '[]'::jsonb) AS items
    FROM qg_job j
    JOIN masterlist m ON m.no = j.masterlist_id
    JOIN checkin c ON c.no = j.source_checkin_id
    LEFT JOIN bay b ON b.no = c.bay_id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(DISTINCT jsonb_build_object(
        'id', s.no, 'name', s.name, 'staff_id', s.staff_id
      )) AS staff
      FROM checkin_staff cs
      JOIN staff s ON s.no = cs.staff_id
      WHERE cs.checkin_id = c.no
    ) st ON TRUE
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object(
        'id', ti.no,
        'name', COALESCE(ti.short_name, 'Accessory')
      ) ORDER BY ti.no) AS items
      FROM task_item ti
      WHERE ti.masterlist_id = j.masterlist_id
        AND TRIM(ti.type) = j.task_type
    ) items ON TRUE
    WHERE j.id = $1
      AND m.cafi_date::date >= $2::date
    LIMIT 1
  `, [jobId, qgCafiStartDate()]);
  return result.rows[0];
};

const getDefectIssues = async (req, taskType) => {
  const result = await req.app.get('pool').query(`
    SELECT id, code, name, task_type
    FROM qg_defect_issue
    WHERE is_active = TRUE
      AND ($1 = 'ALL' OR task_type = 'ALL' OR task_type = $1)
    ORDER BY sort_order, name
  `, [String(taskType || '').toUpperCase()]);
  return result.rows;
};

const getDefectOptions = async (req, taskType) => {
  const [issues, options] = await Promise.all([
    getDefectIssues(req, taskType),
    req.app.get('pool').query(`
      SELECT id, category, name FROM qg_defect_option
      WHERE is_active = TRUE ORDER BY sort_order, id
    `)
  ]);
  return {
    type: issues,
    description: options.rows.filter((row) => row.category === 'description'),
    area: options.rows.filter((row) => row.category === 'area'),
    oe: options.rows.filter((row) => row.category === 'oe')
  };
};

const saveDefectOptions = async (req, category, entries) => {
  if (!['type', 'description', 'area', 'oe'].includes(category) || !Array.isArray(entries) || entries.length > 200 || entries.length === 0) {
    const error = new Error('Invalid defect option list'); error.status = 400; throw error;
  }
  const names = entries.map((entry) => String(entry?.name || '').trim());
  if (names.some((name) => !name || name.length > 150) ||
      new Set(names.map((name) => name.toLowerCase())).size !== names.length) {
    const error = new Error('Options must have unique names of 1–150 characters'); error.status = 400; throw error;
  }
  if (category === 'area' && !names.some((name) => name.toLowerCase() === 'none')) {
    const error = new Error('Area must include None'); error.status = 400; throw error;
  }
  const pool = req.app.get('pool');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const table = category === 'type' ? 'qg_defect_issue' : 'qg_defect_option';
    const existing = await client.query(`SELECT id FROM ${table} WHERE ${category === 'type' ? 'TRUE' : 'category = $1'} FOR UPDATE`, category === 'type' ? [] : [category]);
    const validIds = new Set(existing.rows.map((row) => Number(row.id)));
    const kept = [];
    for (let index = 0; index < entries.length; index += 1) {
      const id = entries[index]?.id == null ? null : Number(entries[index].id);
      if (id !== null && (!Number.isSafeInteger(id) || !validIds.has(id) || kept.includes(id))) {
        const error = new Error('Invalid or duplicate option ID'); error.status = 400; throw error;
      }
      const name = names[index];
      if (id !== null) {
        await client.query(`UPDATE ${table} SET name = $1, sort_order = $2, is_active = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $3`, [name, index + 1, id]);
        kept.push(id);
      } else if (category === 'type') {
        const code = `CUSTOM_${require('crypto').randomUUID().replace(/-/g, '').toUpperCase()}`;
        const inserted = await client.query('INSERT INTO qg_defect_issue (code, name, task_type, sort_order) VALUES ($1, $2, $3, $4) RETURNING id', [code, name, 'ALL', index + 1]);
        kept.push(Number(inserted.rows[0].id));
      } else {
        const inserted = await client.query('INSERT INTO qg_defect_option (category, name, sort_order) VALUES ($1, $2, $3) RETURNING id', [category, name, index + 1]);
        kept.push(Number(inserted.rows[0].id));
      }
    }
    await client.query(`UPDATE ${table} SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE ${category === 'type' ? 'TRUE' : 'category = $1'} AND NOT (id = ANY($${category === 'type' ? 1 : 2}::bigint[]))`, category === 'type' ? [kept] : [category, kept]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK'); throw error;
  } finally { client.release(); }
  return getDefectOptions(req, 'ALL');
};

const submitInspection = async (req, jobId, payload, userId) => {
  const pool = req.app.get('pool');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(`
      SELECT j.*, m.cafi_date::date >= $2::date AS eligible
      FROM qg_job j
      JOIN masterlist m ON m.no = j.masterlist_id
      WHERE j.id = $1
      FOR UPDATE OF j
    `, [jobId, qgCafiStartDate()]);
    const job = locked.rows[0];
    if (!job) {
      const error = new Error('QG task not found');
      error.status = 404;
      throw error;
    }
    if (!job.eligible) {
      const error = new Error('This vehicle is outside the QG CAFI date range');
      error.status = 409;
      throw error;
    }
    const idempotencyKey = String(payload.idempotency_key || '').trim() || null;
    if (idempotencyKey) {
      const existing = await client.query(
        `SELECT *, ${instant('inspected_at')} AS inspected_at FROM qg_inspection WHERE inspected_by = $1 AND idempotency_key = $2`,
        [userId, idempotencyKey]
      );
      if (existing.rows[0]) {
        const saved = existing.rows[0];
        if (saved.voided_at) {
          throw Object.assign(new Error('This check was cancelled. Reopen the task to submit a corrected check.'), { status: 409 });
        }
        if (String(saved.qg_job_id) !== String(jobId) ||
            saved.result !== String(payload.result || '').toUpperCase()) {
          const error = new Error('This submission was already saved for a different task or result. Open My Inspections to check the saved record before continuing.');
          error.status = 409;
          throw error;
        }
        await client.query('ROLLBACK');
        return saved;
      }
    }
    if (job.status !== 'PENDING') {
      const error = new Error('This QG task has already been submitted');
      error.status = 409;
      throw error;
    }

    const result = String(payload.result || '').toUpperCase();
    const defects = Array.isArray(payload.defects) ? payload.defects : [];
    if (!['APPROVED', 'DEFECT'].includes(result)) {
      const error = new Error('Result must be APPROVED or DEFECT');
      error.status = 400;
      throw error;
    }
    if (result === 'DEFECT' && defects.length === 0) {
      const error = new Error('At least one defect is required');
      error.status = 400;
      throw error;
    }
    if (result === 'APPROVED' && defects.length > 0) {
      const error = new Error('Approved inspections cannot contain defects');
      error.status = 400;
      throw error;
    }

    const attempt = await client.query(
      'SELECT COALESCE(MAX(attempt_no), 0) + 1 AS next FROM qg_inspection WHERE qg_job_id = $1',
      [jobId]
    );
    const inserted = await client.query(`
      INSERT INTO qg_inspection (
        qg_job_id, attempt_no, result, inspected_by,
        device_scan_value, idempotency_key, general_remark, inspected_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
      RETURNING *, ${instant('inspected_at')} AS inspected_at
    `, [
      jobId,
      Number(attempt.rows[0].next),
      result,
      userId,
      String(payload.scan_value || '').trim() || null,
      idempotencyKey,
      String(payload.general_remark || '').trim() || null
    ]);
    const inspection = inserted.rows[0];

    for (let index = 0; index < defects.length; index += 1) {
      const defect = defects[index] || {};
      const photos = Array.isArray(defect.photos) ? defect.photos : [];
      if (!Number(defect.issue_id)) {
        const error = new Error(`Defect ${index + 1} requires an issue`);
        error.status = 400;
        throw error;
      }
      if (![defect.issue_id, defect.description_id, defect.area_id].every((value) => Number.isSafeInteger(Number(value)) && Number(value) > 0)) {
        const error = new Error(`Defect ${index + 1} has invalid dropdown selections`);
        error.status = 400; throw error;
      }
      if (photos.length === 0) {
        const error = new Error(`Defect ${index + 1} requires at least one photo`);
        error.status = 400;
        throw error;
      }
      const issue = await client.query(
        'SELECT name FROM qg_defect_issue WHERE id = $1 AND is_active = TRUE AND (task_type = $2 OR task_type = $3)',
        [defect.issue_id, job.task_type, 'ALL']
      );
      if (!issue.rows[0]) {
        const error = new Error(`Defect ${index + 1} has an invalid issue`);
        error.status = 400;
        throw error;
      }
      const selectedOptions = await client.query(`
        SELECT id, category, name FROM qg_defect_option
        WHERE id = ANY($1::bigint[]) AND is_active = TRUE
      `, [[defect.description_id, defect.area_id].map(Number)]);
      const description = selectedOptions.rows.find((row) => row.category === 'description' && Number(row.id) === Number(defect.description_id));
      const area = selectedOptions.rows.find((row) => row.category === 'area' && Number(row.id) === Number(defect.area_id));
      if (!description || !area) {
        const error = new Error(`Defect ${index + 1} requires a valid description and area`);
        error.status = 400; throw error;
      }
      const partsType = defect.parts_type;
      const partId = partsType === 'OE' ? defect.oe_id : defect.accessory_id;
      if (!['OE', 'ACCESSORIES'].includes(partsType) || !Number.isSafeInteger(Number(partId)) || Number(partId) <= 0 ||
          (partsType === 'OE' ? defect.accessory_id != null : defect.oe_id != null)) {
        const error = new Error(`Defect ${index + 1} requires a valid parts selection`);
        error.status = 400; throw error;
      }
      const part = partsType === 'OE'
        ? await client.query("SELECT name FROM qg_defect_option WHERE id = $1 AND category = 'oe' AND is_active = TRUE", [partId])
        : await client.query(`SELECT COALESCE(short_name, 'Accessory') AS name FROM task_item
            WHERE no = $1 AND masterlist_id = $2 AND TRIM(type) = $3`, [partId, job.masterlist_id, job.task_type]);
      if (!part.rows[0]) {
        const error = new Error(`Defect ${index + 1} has an unavailable OE part or an accessory outside this fitment`);
        error.status = 400; throw error;
      }
      const remark = String(defect.remark || '').trim() || null;
      const defectRow = await client.query(`
        INSERT INTO qg_inspection_defect (inspection_id, issue_id, remark, sequence_no,
          description_id, area_id, issue_name, description_name, area_name, parts_type, oe_id, accessory_id, part_name)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id
      `, [inspection.id, defect.issue_id, remark, index + 1,
        description.id, area.id, issue.rows[0].name, description.name, area.name, partsType,
        partsType === 'OE' ? Number(partId) : null, partsType === 'ACCESSORIES' ? Number(partId) : null, part.rows[0].name]);

      for (let photoIndex = 0; photoIndex < photos.length; photoIndex += 1) {
        const photo = verifyPhoto(photos[photoIndex], jobId, userId);
        const storageKey = photo.storage_key;
        await client.query(`
          INSERT INTO qg_defect_photo (
            defect_id, storage_key, url, file_name, content_type,
            file_size, is_prototype, captured_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          defectRow.rows[0].id,
          storageKey,
          photo.url || null,
          photo.file_name || null,
          photo.content_type || null,
          Number(photo.file_size) || null,
          false,
          photo.captured_at || null
        ]);
      }
    }

    await client.query(`
      UPDATE qg_job
      SET status = $1, latest_inspection_id = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [result, inspection.id, jobId]);
    await client.query('COMMIT');
    return inspection;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const listInspections = async (req, filters = {}) => {
  const values = [qgCafiStartDate()];
  const conditions = ['i.voided_at IS NULL', 'm.cafi_date::date >= $1::date'];
  const ownerId = String(filters.mine) === 'true' ? req.user.id : inspectionOwnerId(req);
  if (ownerId !== null) {
    values.push(ownerId);
    conditions.push(`i.inspected_by = $${values.length}::bigint`);
  }
  if (filters.result) {
    values.push(String(filters.result).toUpperCase());
    conditions.push(`i.result = $${values.length}`);
  }
  if (filters.task_type) {
    values.push(String(filters.task_type).toUpperCase());
    conditions.push(`j.task_type = $${values.length}`);
  }
  if (filters.date_from) {
    values.push(filters.date_from);
    conditions.push(`${malaysiaDate('i.inspected_at')} >= $${values.length}::date`);
  }
  if (filters.date_to) {
    values.push(filters.date_to);
    conditions.push(`${malaysiaDate('i.inspected_at')} <= $${values.length}::date`);
  }
  const result = await req.app.get('pool').query(`
    SELECT
      i.id, i.result, ${instant('i.inspected_at')} AS inspected_at, i.attempt_no,
      j.id AS job_id, j.task_type,
      m.chassis, m.fitment_id, m.model_description,
      a.username AS inspector, ${latestAuditSql('i.qg_job_id')} AS audit,
      COUNT(d.id)::int AS defect_count,
      STRING_AGG(DISTINCT COALESCE(d.issue_name, issue.name), ', ' ORDER BY COALESCE(d.issue_name, issue.name)) AS defect_types,
      STRING_AGG(DISTINCT NULLIF(BTRIM(d.remark), ''), ' | ' ORDER BY NULLIF(BTRIM(d.remark), '')) AS defect_remarks
    FROM qg_inspection i
    JOIN qg_job j ON j.id = i.qg_job_id
    JOIN masterlist m ON m.no = j.masterlist_id
    JOIN admins a ON a.id = i.inspected_by
    LEFT JOIN qg_inspection_defect d ON d.inspection_id = i.id
    LEFT JOIN qg_defect_issue issue ON issue.id = d.issue_id
    WHERE ${conditions.join(' AND ')}
    GROUP BY i.id, j.id, m.no, a.id
    ORDER BY i.inspected_at DESC
    LIMIT 200
  `, values);
  return result.rows;
};

const getInspectionExport = async (req) => {
  const db = req.app.get('pool');
  const ownerId = inspectionOwnerId(req);
  const [inspections, defects, pending] = await Promise.all([
    db.query(`
      SELECT i.id, i.result, ${instant('i.inspected_at')} AS inspected_at,
        i.attempt_no, i.general_remark, j.id AS job_id, j.status AS qg_status,
        j.task_type, m.fitment_id, m.chassis, m.model_description,
        a.username AS inspector, ${latestAuditSql('i.qg_job_id')} AS audit, b.name AS bay,
        ${installationInstant('c.checkin_time')} AS checkin_time,
        ${installationInstant('c.checkout_time')} AS checkout_time,
        c.remark AS cardio_remark,
        COALESCE(st.installers, '') AS installers,
        COALESCE(items.items, '') AS items
      FROM qg_inspection i
      JOIN qg_job j ON j.id = i.qg_job_id
      JOIN masterlist m ON m.no = j.masterlist_id
      JOIN admins a ON a.id = i.inspected_by
      JOIN checkin c ON c.no = j.source_checkin_id
      LEFT JOIN bay b ON b.no = c.bay_id
      LEFT JOIN LATERAL (
        SELECT STRING_AGG(DISTINCT s.name, ', ' ORDER BY s.name) AS installers
        FROM checkin_staff cs
        JOIN staff s ON s.no = cs.staff_id
        WHERE cs.checkin_id = c.no
      ) st ON TRUE
      LEFT JOIN LATERAL (
        SELECT STRING_AGG(COALESCE(ti.short_name, 'Accessory'), ', ' ORDER BY ti.no) AS items
        FROM task_item ti
        WHERE ti.masterlist_id = j.masterlist_id AND TRIM(ti.type) = j.task_type
      ) items ON TRUE
      WHERE i.voided_at IS NULL
        AND m.cafi_date::date >= $2::date
        AND ($1::bigint IS NULL OR i.inspected_by = $1::bigint)
      ORDER BY i.inspected_at DESC, i.id DESC
    `, [ownerId, qgCafiStartDate()]),
    db.query(`
      SELECT d.id, i.id AS inspection_id, d.sequence_no, COALESCE(d.issue_name, issue.name) AS defect_type,
        d.description_name AS defect_description, d.area_name AS area, d.parts_type, d.part_name,
        d.remark, d.approved_at, reviewer.username AS approved_by_name,
        COALESCE(photo.photo_count, 0) AS photo_count,
        COALESCE(photo.file_names, '') AS photo_files
      FROM qg_inspection_defect d
      JOIN qg_inspection i ON i.id = d.inspection_id
      JOIN qg_job j ON j.id = i.qg_job_id
      JOIN masterlist m ON m.no = j.masterlist_id
      JOIN qg_defect_issue issue ON issue.id = d.issue_id
      LEFT JOIN admins reviewer ON reviewer.id = d.approved_by
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS photo_count,
          STRING_AGG(p.file_name, ', ' ORDER BY p.id) AS file_names
        FROM qg_defect_photo p
        WHERE p.defect_id = d.id
      ) photo ON TRUE
      WHERE i.voided_at IS NULL
        AND m.cafi_date::date >= $2::date
        AND ($1::bigint IS NULL OR i.inspected_by = $1::bigint)
      ORDER BY i.inspected_at DESC, i.id DESC, d.sequence_no, d.id
    `, [ownerId, qgCafiStartDate()]),
    db.query(`
      SELECT j.id AS job_id, j.task_type, ${installationInstant('j.available_at')} AS available_at,
        m.chassis, m.fitment_id, m.model_description, b.name AS bay,
        COALESCE(st.installers, '') AS installers,
        COALESCE(items.items, '') AS items
      FROM qg_job j
      JOIN masterlist m ON m.no = j.masterlist_id
      JOIN checkin c ON c.no = j.source_checkin_id
      LEFT JOIN bay b ON b.no = c.bay_id
      LEFT JOIN LATERAL (
        SELECT STRING_AGG(DISTINCT s.name, ', ' ORDER BY s.name) AS installers
        FROM checkin_staff cs
        JOIN staff s ON s.no = cs.staff_id
        WHERE cs.checkin_id = c.no
      ) st ON TRUE
      LEFT JOIN LATERAL (
        SELECT STRING_AGG(COALESCE(ti.short_name, 'Accessory'), ', ' ORDER BY ti.no) AS items
        FROM task_item ti
        WHERE ti.masterlist_id = j.masterlist_id AND TRIM(ti.type) = j.task_type
      ) items ON TRUE
      WHERE j.status = 'PENDING'
        AND m.cafi_date::date >= $1::date
      ORDER BY j.available_at DESC, j.id DESC
    `, [qgCafiStartDate()])
  ]);
  return { inspections: inspections.rows, defects: defects.rows, pending: pending.rows };
};

const getInspectionDetail = async (req, inspectionId) => {
  const db = req.app.get('pool');
  const ownerId = inspectionOwnerId(req);
  const inspection = await db.query(`
    SELECT i.id, i.result, ${instant('i.inspected_at')} AS inspected_at,
      i.attempt_no, i.general_remark, j.task_type, m.chassis, m.fitment_id,
      m.model_description, a.username AS inspector, ${latestAuditSql('i.qg_job_id')} AS audit,
      ${installationInstant('c.checkin_time')} AS checkin_time,
      ${installationInstant('c.checkout_time')} AS checkout_time,
      c.remark AS cardio_remark, b.name AS bay,
      COALESCE(st.installers, '[]'::jsonb) AS installers,
      COALESCE(items.items, '[]'::jsonb) AS items
    FROM qg_inspection i
    JOIN qg_job j ON j.id = i.qg_job_id
    JOIN masterlist m ON m.no = j.masterlist_id
    JOIN admins a ON a.id = i.inspected_by
    JOIN checkin c ON c.no = j.source_checkin_id
    LEFT JOIN bay b ON b.no = c.bay_id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(DISTINCT jsonb_build_object(
        'id', s.no, 'name', s.name, 'staff_id', s.staff_id
      )) AS installers
      FROM checkin_staff cs
      JOIN staff s ON s.no = cs.staff_id
      WHERE cs.checkin_id = c.no
    ) st ON TRUE
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object(
        'id', ti.no, 'name', COALESCE(ti.short_name, 'Accessory')
      ) ORDER BY ti.no) AS items
      FROM task_item ti
      WHERE ti.masterlist_id = j.masterlist_id AND TRIM(ti.type) = j.task_type
    ) items ON TRUE
    WHERE i.id = $1 AND i.voided_at IS NULL
      AND m.cafi_date::date >= $3::date
      AND ($2::bigint IS NULL OR i.inspected_by = $2::bigint)
  `, [inspectionId, ownerId, qgCafiStartDate()]);
  if (!inspection.rows[0]) return null;
  const defects = await db.query(`
    SELECT d.id, d.sequence_no, d.remark, COALESCE(d.issue_name, issue.name) AS issue,
      d.description_name AS description, d.area_name AS area, d.parts_type, d.part_name,
      d.approved_at, reviewer.username AS approved_by_name,
      p.id AS photo_id, p.storage_key, p.file_name
    FROM qg_inspection_defect d
    JOIN qg_defect_issue issue ON issue.id = d.issue_id
    LEFT JOIN admins reviewer ON reviewer.id = d.approved_by
    LEFT JOIN qg_defect_photo p ON p.defect_id = d.id
    WHERE d.inspection_id = $1
    ORDER BY d.sequence_no, d.id, p.id
  `, [inspectionId]);
  const grouped = new Map();
  for (const row of defects.rows) {
    if (!grouped.has(row.id)) grouped.set(row.id, {
      id: row.id, sequence_no: row.sequence_no, issue: row.issue,
      description: row.description, area: row.area, parts_type: row.parts_type, part_name: row.part_name, remark: row.remark,
      approved_at: row.approved_at, approved_by_name: row.approved_by_name, photos: []
    });
    if (row.photo_id) grouped.get(row.id).photos.push({
      id: row.photo_id, file_name: row.file_name,
      url: getSignedReadUrl(row.storage_key)
    });
  }
  return { ...inspection.rows[0], defects: [...grouped.values()] };
};

// Lock the job first, matching submitInspection, so cancellation cannot race a submission.
const cancelInspection = async (req, inspectionId, reason) => {
  const fail = (status, message) => Object.assign(new Error(message), { status });
  if (req.user?.type !== 'admin' || !['manager', 'supervisor', 'admin', 'superadmin'].includes(String(req.user?.role || '').toLowerCase())) {
    throw fail(403, 'Only authorized admins can cancel a QG check');
  }
  if (!/^\d+$/.test(String(inspectionId)) || Number(inspectionId) <= 0) throw fail(400, 'Invalid inspection');
  const note = typeof reason === 'string' ? reason.trim() : '';
  if (!note || note.length > 1000) throw fail(400, 'Enter a cancellation reason (up to 1000 characters)');
  const client = await req.app.get('pool').connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(`
      SELECT j.id AS job_id, j.latest_inspection_id, i.voided_at
      FROM qg_job j JOIN qg_inspection i ON i.qg_job_id = j.id
      JOIN masterlist m ON m.no = j.masterlist_id
      WHERE i.id = $1 AND m.cafi_date::date >= $2::date
      FOR UPDATE OF j
    `, [inspectionId, qgCafiStartDate()]);
    const row = locked.rows[0];
    if (!row) throw fail(404, 'Inspection not found');
    // Read again after acquiring the job lock: a concurrent cancellation may have committed.
    const current = await client.query('SELECT voided_at FROM qg_inspection WHERE id = $1 FOR UPDATE', [inspectionId]);
    if (current.rows[0].voided_at) {
      await client.query('COMMIT');
      return { inspection_id: inspectionId, job_id: row.job_id, already_cancelled: true };
    }
    if (String(row.latest_inspection_id) !== String(inspectionId)) {
      throw fail(409, 'A newer check exists. Refresh and cancel the latest check instead.');
    }
    await client.query(`UPDATE qg_inspection
      SET voided_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC', voided_by = $2, void_reason = $3
      WHERE id = $1`, [inspectionId, req.user.id, note]);
    await client.query(`UPDATE qg_job SET status = 'PENDING', latest_inspection_id = NULL,
      updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [row.job_id]);
    await client.query('COMMIT');
    return { inspection_id: inspectionId, job_id: row.job_id, status: 'PENDING', already_cancelled: false };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
};

const approveInspectionDefect = async (req, inspectionId, defectId) => {
  if (!/^\d+$/.test(String(inspectionId)) || !/^\d+$/.test(String(defectId)) || Number(inspectionId) <= 0 || Number(defectId) <= 0) {
    const error = new Error('Invalid QG defect'); error.status = 400; throw error;
  }
  const db = req.app.get('pool');
  const updated = await db.query(`
    UPDATE qg_inspection_defect d
    SET approved_at = NOW(), approved_by = $3
    FROM qg_inspection i
    JOIN qg_job j ON j.id = i.qg_job_id
    JOIN masterlist m ON m.no = j.masterlist_id
    WHERE d.id = $2 AND d.inspection_id = i.id AND i.id = $1
      AND m.cafi_date::date >= $4::date
      AND i.voided_at IS NULL AND d.approved_at IS NULL
    RETURNING d.id, d.approved_at
  `, [inspectionId, defectId, req.user.id, qgCafiStartDate()]);
  if (updated.rows[0]) return updated.rows[0];
  const existing = await db.query(`
    SELECT d.id, d.approved_at FROM qg_inspection_defect d
    JOIN qg_inspection i ON i.id = d.inspection_id
    JOIN qg_job j ON j.id = i.qg_job_id
    JOIN masterlist m ON m.no = j.masterlist_id
    WHERE i.id = $1 AND d.id = $2 AND i.voided_at IS NULL
      AND m.cafi_date::date >= $3::date
  `, [inspectionId, defectId, qgCafiStartDate()]);
  const error = new Error(existing.rows.length ? 'This QG defect is already approved' : 'QG defect not found');
  error.status = existing.rows.length ? 409 : 404;
  throw error;
};

module.exports = {
  syncEligibleQgJobs,
  qgCafiStartDate,
  listPendingJobs,
  getDashboard,
  resolveScan,
  getJobDetail,
  getDefectIssues,
  getDefectOptions,
  saveDefectOptions,
  submitInspection,
  listInspections,
  getInspectionExport,
  getInspectionDetail,
  approveInspectionDefect,
  cancelInspection
};
