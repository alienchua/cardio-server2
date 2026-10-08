const { verifyCaPhoto } = require('../../../../utils/caPhoto');
const { getSignedReadUrl } = require('../../../../utils/s3Upload');
const { getDefectOptions } = require('./qgModel');

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const positiveId = (value) => /^\d+$/.test(String(value)) && Number(value) > 0;
const dateFilter = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

const latestCasesSql = `
  WITH latest AS (
    SELECT DISTINCT ON (case_id) id, case_id, attempt_no, result, checked_at, checked_by_name
    FROM ca_line_check ORDER BY case_id, attempt_no DESC
  )
  SELECT c.id AS case_id, c.fitment_id, c.chassis, c.model_description, c.work_type,
    ca.id AS ca_check_id, ca.result AS ca_status, ca.checked_at AS last_ca_checked_at,
    ca.checked_by_name AS checker, ca.attempt_no
  FROM ca_case c JOIN latest ca ON ca.case_id = c.id
`;

const listCases = async (req, filters = {}) => {
  const values = [];
  const conditions = [];
  const search = String(filters.search || '').trim().slice(0, 100);
  if (search) {
    values.push(`%${search}%`);
    conditions.push(`(c.fitment_id ILIKE $${values.length} OR c.chassis ILIKE $${values.length} OR c.model_description ILIKE $${values.length})`);
  }
  if (dateFilter(filters.date_from)) {
    values.push(filters.date_from);
    conditions.push(`(ca.checked_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= $${values.length}::date`);
  }
  if (dateFilter(filters.date_to)) {
    values.push(filters.date_to);
    conditions.push(`(ca.checked_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date <= $${values.length}::date`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const db = req.app.get('pool');
  const summaryResult = await db.query(`
    SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE ca_status = 'APPROVED')::int AS approved,
      COUNT(*) FILTER (WHERE ca_status = 'DEFECT')::int AS defect,
      COUNT(*) FILTER (WHERE ca_status = 'INFO')::int AS info
    FROM (${latestCasesSql} ${where}) cases
  `, values);
  const summary = summaryResult.rows[0];
  const status = String(filters.status || '').toUpperCase();
  const filteredValues = [...values];
  const statusCondition = ['APPROVED', 'DEFECT', 'INFO'].includes(status)
    ? `${where ? 'AND' : 'WHERE'} ca.result = $${filteredValues.push(status)}`
    : '';
  const page = Math.max(1, Number.parseInt(filters.page, 10) || 1);
  const pageSize = 10;
  const limitIndex = filteredValues.push(pageSize);
  const offsetIndex = filteredValues.push((page - 1) * pageSize);
  const result = await db.query(`
    ${latestCasesSql} ${where} ${statusCondition}
    ORDER BY ca.checked_at DESC, ca.id DESC LIMIT $${limitIndex} OFFSET $${offsetIndex}
  `, filteredValues);
  return {
    rows: result.rows, summary,
    total: status === 'APPROVED' ? summary.approved : status === 'DEFECT' ? summary.defect : status === 'INFO' ? summary.info : summary.total,
    page, page_size: pageSize
  };
};

const lookupVehicles = async (req, fitmentId) => {
  const value = String(fitmentId || '').trim();
  if (!value || value.length > 100) throw fail('Enter a valid Fitment ID');
  const result = await req.app.get('pool').query(`
    SELECT m.no AS masterlist_id, m.fitment_id, m.chassis, m.model_description,
      ARRAY(
        SELECT DISTINCT BTRIM(ti.type)
        FROM task_item ti
        WHERE ti.masterlist_id = m.no AND BTRIM(ti.type) IN ('FITMENT', 'HOIST')
        ORDER BY 1
      ) AS work_types
    FROM masterlist m
    WHERE LOWER(BTRIM(m.fitment_id)) = LOWER($1)
    ORDER BY m.no DESC LIMIT 11
  `, [value]);
  if (result.rows.length > 10) throw fail('Too many vehicles match this Fitment ID. Enter the CA details manually.', 409);
  return result.rows;
};

const getCase = async (req, caseId) => {
  if (!positiveId(caseId)) throw fail('Invalid CA case');
  const db = req.app.get('pool');
  const caseResult = await db.query(`
    SELECT id AS case_id, fitment_id, chassis, model_description, masterlist_id, work_type, created_at
    FROM ca_case WHERE id = $1
  `, [caseId]);
  if (!caseResult.rows.length) return null;
  const checksResult = await db.query(`
    SELECT c.id, c.attempt_no, c.result, c.checked_by_name,
      c.checked_at, c.general_remark, c.correction_reason, c.recorded_at,
      a.username AS recorded_by
    FROM ca_line_check c JOIN admins a ON a.id = c.recorded_by
    WHERE c.case_id = $1 ORDER BY c.attempt_no DESC
  `, [caseId]);
  const checks = checksResult.rows;
  if (checks.length) {
    const defects = await db.query(`
      SELECT d.id, d.line_check_id, d.sequence_no, d.issue_name, d.description_name, d.area_name, d.remark,
        d.approved_at, reviewer.username AS approved_by_name,
        p.id AS photo_id, p.storage_key AS photo_storage_key, p.file_name AS photo_file_name
      FROM ca_line_check_defect d
      LEFT JOIN admins reviewer ON reviewer.id = d.approved_by
      LEFT JOIN ca_line_check_photo p ON p.defect_id = d.id
      WHERE d.line_check_id = ANY($1::bigint[]) ORDER BY d.line_check_id DESC, d.sequence_no, p.id
    `, [checks.map((check) => check.id)]);
    const byCheck = new Map(checks.map((check) => [String(check.id), check]));
    const byDefect = new Map();
    for (const row of defects.rows) {
      const check = byCheck.get(String(row.line_check_id));
      if (!check) continue;
      if (!check.defects) check.defects = [];
      let defect = byDefect.get(String(row.id));
      if (!defect) {
        defect = { id: row.id, sequence_no: row.sequence_no, issue_name: row.issue_name, description_name: row.description_name, area_name: row.area_name, remark: row.remark, approved_at: row.approved_at, approved_by_name: row.approved_by_name, photos: [] };
        byDefect.set(String(row.id), defect);
        check.defects.push(defect);
      }
      if (row.photo_id) defect.photos.push({ id: row.photo_id, url: getSignedReadUrl(row.photo_storage_key), file_name: row.photo_file_name });
    }
  }
  return { ...caseResult.rows[0], ca_status: checks[0]?.result || null, checks: checks.map((check) => ({ ...check, defects: check.defects || [] })) };
};

const cleanVehicle = (payload) => {
  const fitmentId = String(payload.fitment_id || '').trim();
  const chassis = String(payload.chassis || '').trim();
  const model = String(payload.model_description || '').trim();
  const workType = String(payload.work_type || '').trim().toUpperCase();
  const masterlistId = payload.masterlist_id ? String(payload.masterlist_id) : null;
  if (!fitmentId && !chassis) throw fail('Enter a fitment ID or chassis number');
  if (fitmentId.length > 100 || chassis.length > 100 || model.length > 200) throw fail('Vehicle details are too long');
  if (!['FITMENT', 'HOIST'].includes(workType)) throw fail('Select Fitment or Hoist');
  if (masterlistId && !positiveId(masterlistId)) throw fail('Invalid linked vehicle');
  return { fitmentId: fitmentId || null, chassis: chassis || null, model: model || null, masterlistId, workType };
};

const cleanCheck = async (req, payload, workType) => {
  const name = String(payload.checked_by_name || '').trim();
  const remark = String(payload.general_remark || '').trim();
  const correctionReason = String(payload.correction_reason || '').trim();
  const checkedAt = new Date(payload.checked_at);
  const result = String(payload.result || '').toUpperCase();
  const defects = payload.defects;
  const draftKey = String(payload.draft_key || '');
  if (!name || name.length > 150) throw fail('Enter the external CA checker name');
  if (!payload.checked_at || Number.isNaN(checkedAt.getTime())) throw fail('Enter a valid CA check date and time');
  if (checkedAt.getTime() > Date.now() + 5 * 60 * 1000) throw fail('CA check time cannot be in the future');
  if (!['DEFECT', 'INFO'].includes(result)) throw fail('Select Defect or Info');
  if (remark.length > 5000) throw fail('CA note is too long');
  if (correctionReason.length > 1000) throw fail('Correction reason is too long');
  if (!Array.isArray(defects) || !defects.length || defects.length > 20) throw fail(`Add at least one ${result === 'INFO' ? 'info' : 'defect'} entry`);
  const options = await getDefectOptions(req, workType || 'ALL');
  const cleanDefects = defects.map((row, index) => {
    if (!row || typeof row !== 'object') throw fail(`Invalid entry ${index + 1}`);
    const selected = ['type', 'description', 'area'].map((category) => options[category].find((option) => Number(option.id) === Number(row[`${category}_id`])));
    if (selected.some((option) => !option)) throw fail(`Select a valid type, description and area for ${result === 'INFO' ? 'info' : 'defect'} ${index + 1}`);
    const [issue, description, area] = selected.map((option) => option.name);
    const note = String(row.remark || '').trim();
    const photos = row.photos || [];
    if ([issue, description, area].some((s) => s.length > 150)) throw fail(`Details are too long for defect ${index + 1}`);
    if (note.length > 5000 || !Array.isArray(photos) || photos.length > 10) throw fail(`Invalid details for defect ${index + 1}`);
    return { issue, description, area, note, photos: photos.map((photo) => verifyCaPhoto(photo.upload_token, draftKey, req.user.id)) };
  });
  return { name, remark, correctionReason, checkedAt, result, defects: cleanDefects };
};

const insertCheck = async (client, req, caseId, attemptNo, check) => {
  const created = await client.query(`
    INSERT INTO ca_line_check (case_id, attempt_no, result, checked_by_name, checked_at, general_remark, correction_reason, recorded_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, attempt_no
  `, [caseId, attemptNo, check.result, check.name, check.checkedAt.toISOString(), check.remark || null, check.correctionReason || null, req.user.id]);
  for (const [index, defect] of check.defects.entries()) {
    const inserted = await client.query(`
      INSERT INTO ca_line_check_defect (line_check_id, sequence_no, issue_name, description_name, area_name, remark)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
    `, [created.rows[0].id, index + 1, defect.issue || null, defect.description || null, defect.area || null, defect.note || null]);
    for (const photo of defect.photos) await client.query(`
      INSERT INTO ca_line_check_photo (defect_id, storage_key, url, file_name, content_type, file_size)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [inserted.rows[0].id, photo.storage_key, photo.url, photo.file_name, photo.content_type, photo.file_size]);
  }
  return created.rows[0];
};

const createCase = async (req, payload) => {
  const vehicle = cleanVehicle(payload);
  const check = await cleanCheck(req, payload, vehicle.workType);
  const client = await req.app.get('pool').connect();
  try {
    await client.query('BEGIN');
    if (vehicle.masterlistId) {
      const linked = await client.query(`
        SELECT m.fitment_id, m.chassis, m.model_description,
          ARRAY(
            SELECT DISTINCT BTRIM(ti.type) FROM task_item ti
            WHERE ti.masterlist_id = m.no AND BTRIM(ti.type) IN ('FITMENT', 'HOIST')
          ) AS work_types
        FROM masterlist m WHERE m.no = $1 FOR SHARE
      `, [vehicle.masterlistId]);
      const match = linked.rows[0];
      if (!match || String(match.fitment_id || '').trim().toLowerCase() !== String(vehicle.fitmentId || '').toLowerCase()) throw fail('Fitment ID no longer matches the linked vehicle. Look it up again', 409);
      if (match.work_types.length && !match.work_types.includes(vehicle.workType)) throw fail('Select a work type assigned to this vehicle', 400);
      vehicle.fitmentId = match.fitment_id;
      vehicle.chassis = match.chassis || null;
      vehicle.model = match.model_description || null;
    }
    const created = await client.query(`
      INSERT INTO ca_case (fitment_id, chassis, model_description, masterlist_id, work_type, created_by)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
    `, [vehicle.fitmentId, vehicle.chassis, vehicle.model, vehicle.masterlistId, vehicle.workType, req.user.id]);
    const caseId = created.rows[0].id;
    const saved = await insertCheck(client, req, caseId, 1, check);
    await client.query('COMMIT');
    return { case_id: caseId, ...saved };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
};

const submitCheck = async (req, caseId, payload) => {
  if (!positiveId(caseId)) throw fail('Invalid CA case');
  const client = await req.app.get('pool').connect();
  try {
    await client.query('BEGIN');
    const lock = await client.query('SELECT id, work_type FROM ca_case WHERE id = $1 FOR UPDATE', [caseId]);
    if (!lock.rows.length) throw fail('CA case not found', 404);
    const check = await cleanCheck(req, payload, lock.rows[0].work_type);
    const latest = await client.query('SELECT attempt_no, result FROM ca_line_check WHERE case_id = $1 ORDER BY attempt_no DESC LIMIT 1', [caseId]);
    if (latest.rows[0]?.result === 'APPROVED' && !check.correctionReason) throw fail('Explain why the approved CA check is being corrected', 409);
    const saved = await insertCheck(client, req, caseId, Number(latest.rows[0]?.attempt_no || 0) + 1, check);
    await client.query('COMMIT');
    return { case_id: caseId, ...saved };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
};

module.exports = { listCases, lookupVehicles, getCase, createCase, submitCheck };
