const normalizeDate = (value, fallback) => {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : fallback;
};

const QG_DEFAULT_START_DATE = '2026-09-18';

const syncEligibleQgJobs = async (db) => {
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(process.env.QG_START_DATE || ''))
    ? process.env.QG_START_DATE
    : QG_DEFAULT_START_DATE;
  const query = `
    WITH required_types AS (
      SELECT DISTINCT masterlist_id, TRIM(type) AS task_type
      FROM task_item
      WHERE TRIM(type) IN ('FITMENT', 'HOIST')
    ),
    completed AS (
      SELECT DISTINCT ON (masterlist_id, TRIM(type))
        no,
        masterlist_id,
        TRIM(type) AS task_type,
        checkout_time
      FROM checkin
      WHERE TRIM(type) IN ('FITMENT', 'HOIST')
        AND status = 'Check-Out'
        AND checkout_time IS NOT NULL
        AND checkout_time >= $1::date
      ORDER BY masterlist_id, TRIM(type), checkout_time DESC, no DESC
    ),
    ready_vehicles AS (
      SELECT r.masterlist_id
      FROM required_types r
      LEFT JOIN completed c
        ON c.masterlist_id = r.masterlist_id
       AND c.task_type = r.task_type
      GROUP BY r.masterlist_id
      HAVING COUNT(*) = COUNT(c.no)
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
      c.checkout_time
    FROM required_types r
    JOIN ready_vehicles v ON v.masterlist_id = r.masterlist_id
    JOIN completed c
      ON c.masterlist_id = r.masterlist_id
     AND c.task_type = r.task_type
    ON CONFLICT (masterlist_id, task_type) DO UPDATE
      SET source_checkin_id = EXCLUDED.source_checkin_id,
          available_at = EXCLUDED.available_at,
          updated_at = CURRENT_TIMESTAMP
      WHERE qg_job.status = 'PENDING'
    RETURNING id
  `;
  const result = await db.query(query, [startDate]);
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

  const summary = await db.query(`
    SELECT
      (SELECT COUNT(*)::int FROM qg_job WHERE status = 'PENDING') AS pending,
      COUNT(*)::int AS completed,
      COUNT(*) FILTER (WHERE result = 'APPROVED')::int AS approved,
      COUNT(*) FILTER (WHERE result = 'DEFECT')::int AS defect
    FROM qg_inspection
    WHERE voided_at IS NULL
      AND (inspected_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date
          BETWEEN $1::date AND $2::date
  `, [dateFrom, dateTo]);

  const recent = await db.query(`
    SELECT
      i.id,
      i.result,
      i.inspected_at,
      j.task_type,
      m.chassis,
      m.fitment_id,
      m.model_description,
      a.username AS inspector,
      COUNT(d.id)::int AS defect_count
    FROM qg_inspection i
    JOIN qg_job j ON j.id = i.qg_job_id
    JOIN masterlist m ON m.no = j.masterlist_id
    JOIN admins a ON a.id = i.inspected_by
    LEFT JOIN qg_inspection_defect d ON d.inspection_id = i.id
    WHERE i.voided_at IS NULL
    GROUP BY i.id, j.task_type, m.chassis, m.fitment_id, m.model_description, a.username
    ORDER BY i.inspected_at DESC
    LIMIT 8
  `);

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
          'available_at', j.available_at,
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
       OR LOWER(TRIM(m.chassis)) = LOWER($1)
    GROUP BY m.no
    ORDER BY CASE WHEN LOWER(TRIM(m.fitment_id)) = LOWER($1) THEN 0 ELSE 1 END
    LIMIT 2
  `, [value]);
  return result.rows;
};

const getJobDetail = async (req, jobId) => {
  const result = await req.app.get('pool').query(`
    SELECT
      j.id AS job_id,
      j.status AS qg_status,
      j.task_type,
      j.available_at,
      m.no AS masterlist_id,
      m.chassis,
      m.fitment_id,
      m.seq,
      m.model_code,
      m.model_description,
      m.colour,
      m.cafi_date,
      c.checkin_time,
      c.checkout_time,
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
    LIMIT 1
  `, [jobId]);
  return result.rows[0];
};

const getDefectIssues = async (req, taskType) => {
  const result = await req.app.get('pool').query(`
    SELECT id, code, name, task_type
    FROM qg_defect_issue
    WHERE is_active = TRUE
      AND (task_type = 'ALL' OR task_type = $1)
    ORDER BY sort_order, name
  `, [String(taskType || '').toUpperCase()]);
  return result.rows;
};

const submitInspection = async (req, jobId, payload, userId) => {
  const pool = req.app.get('pool');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query('SELECT * FROM qg_job WHERE id = $1 FOR UPDATE', [jobId]);
    const job = locked.rows[0];
    if (!job) {
      const error = new Error('QG task not found');
      error.status = 404;
      throw error;
    }
    const idempotencyKey = String(payload.idempotency_key || '').trim() || null;
    if (idempotencyKey) {
      const existing = await client.query(
        'SELECT * FROM qg_inspection WHERE inspected_by = $1 AND idempotency_key = $2',
        [userId, idempotencyKey]
      );
      if (existing.rows[0]) {
        await client.query('ROLLBACK');
        return existing.rows[0];
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
        device_scan_value, idempotency_key, general_remark
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
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
      if (photos.length === 0) {
        const error = new Error(`Defect ${index + 1} requires at least one photo`);
        error.status = 400;
        throw error;
      }
      const issue = await client.query(
        'SELECT code FROM qg_defect_issue WHERE id = $1 AND is_active = TRUE',
        [defect.issue_id]
      );
      if (!issue.rows[0]) {
        const error = new Error(`Defect ${index + 1} has an invalid issue`);
        error.status = 400;
        throw error;
      }
      const remark = String(defect.remark || '').trim() || null;
      if (issue.rows[0].code === 'OTHER' && !remark) {
        const error = new Error('A remark is required for Other');
        error.status = 400;
        throw error;
      }
      const defectRow = await client.query(`
        INSERT INTO qg_inspection_defect (inspection_id, issue_id, remark, sequence_no)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `, [inspection.id, defect.issue_id, remark, index + 1]);

      for (let photoIndex = 0; photoIndex < photos.length; photoIndex += 1) {
        const photo = photos[photoIndex] || {};
        const isPrototype = Boolean(photo.is_prototype || photo.prototype_key);
        const storageKey = String(
          photo.storage_key || photo.upload_token || photo.prototype_key ||
          `prototype/qg-${inspection.id}-${index + 1}-${photoIndex + 1}`
        );
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
          isPrototype,
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
  const values = [];
  const conditions = ['i.voided_at IS NULL'];
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
    conditions.push(`(i.inspected_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= $${values.length}::date`);
  }
  if (filters.date_to) {
    values.push(filters.date_to);
    conditions.push(`(i.inspected_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date <= $${values.length}::date`);
  }
  const result = await req.app.get('pool').query(`
    SELECT
      i.id, i.result, i.inspected_at, i.attempt_no,
      j.id AS job_id, j.task_type,
      m.chassis, m.fitment_id, m.model_description,
      a.username AS inspector,
      COUNT(d.id)::int AS defect_count
    FROM qg_inspection i
    JOIN qg_job j ON j.id = i.qg_job_id
    JOIN masterlist m ON m.no = j.masterlist_id
    JOIN admins a ON a.id = i.inspected_by
    LEFT JOIN qg_inspection_defect d ON d.inspection_id = i.id
    WHERE ${conditions.join(' AND ')}
    GROUP BY i.id, j.id, m.no, a.id
    ORDER BY i.inspected_at DESC
    LIMIT 200
  `, values);
  return result.rows;
};

module.exports = {
  syncEligibleQgJobs,
  getDashboard,
  resolveScan,
  getJobDetail,
  getDefectIssues,
  submitInspection,
  listInspections
};
