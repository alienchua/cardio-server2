const crypto = require('crypto');
const { getJobDetail, qgCafiStartDate } = require('./qgModel');
const { verifyPhoto } = require('../../../../utils/auditPhoto');
const { getSignedReadUrl } = require('../../../../utils/s3Upload');
const fail = (status, message) => Object.assign(new Error(message), { status });
const canWrite = req => req.user?.type === 'admin' && ['supervisor', 'superadmin'].includes(String(req.user?.role || '').toLowerCase());
const requireWriter = req => { if (!canWrite(req)) throw fail(403, 'Only supervisors and superadmins can change audit checks'); };
const id = value => { if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0) throw fail(400, 'Invalid record'); return String(value); };
const myDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

const lookupJobs = async (req, query) => {
  const search = String(query || '').trim();
  if (!search || search.length > 100) throw fail(400, 'Enter a fitment ID or chassis');
  const result = await req.app.get('pool').query(`
    SELECT j.id AS job_id, j.task_type, j.status AS qg_status, m.fitment_id, m.chassis, m.model_description,
      (SELECT ai.result FROM audit_inspection ai WHERE ai.qg_job_id = j.id AND ai.voided_at IS NULL ORDER BY ai.id DESC LIMIT 1) AS audit_result
    FROM qg_job j JOIN masterlist m ON m.no = j.masterlist_id
    WHERE m.cancel_time IS NULL AND m.cafi_date::date >= $2::date
      AND (m.fitment_id ILIKE $1 OR m.chassis ILIKE $1)
    ORDER BY m.no DESC, j.task_type LIMIT 30
  `, [`%${search.replace(/[\\%_]/g, '\\$&')}%`, qgCafiStartDate()]);
  return result.rows;
};

const listAudits = async (req, filters = {}) => {
  const from = String(filters.date_from || myDate()), to = String(filters.date_to || from);
  if (!validDate(from) || !validDate(to) || from > to) throw fail(400, 'Choose a valid date range');
  const result = String(filters.result || '');
  const type = String(filters.task_type || '');
  if (result && !['APPROVED', 'DEFECT'].includes(result)) throw fail(400, 'Invalid result filter');
  if (type && !['FITMENT', 'HOIST'].includes(type)) throw fail(400, 'Invalid work type');
  const auditor = filters.auditor_id ? id(filters.auditor_id) : null;
  const page = Math.max(1, Math.min(100000, Number.parseInt(filters.page, 10) || 1));
  const params = [from, to, result || null, type || null, auditor, String(filters.search || '').slice(0, 100), filters.include_cancelled === 'true'];
  const where = `WHERE (ai.inspected_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date BETWEEN $1::date AND $2::date
    AND ($3::text IS NULL OR ai.result = $3) AND ($4::text IS NULL OR j.task_type = $4)
    AND ($5::bigint IS NULL OR ai.audited_by = $5)
    AND ($6 = '' OR m.fitment_id ILIKE '%' || $6 || '%' OR m.chassis ILIKE '%' || $6 || '%')
    AND ($7::boolean OR ai.voided_at IS NULL)`;
  const joins = `FROM audit_inspection ai JOIN qg_job j ON j.id = ai.qg_job_id JOIN masterlist m ON m.no = j.masterlist_id JOIN admins a ON a.id = ai.audited_by`;
  const db = req.app.get('pool');
  const summary = await db.query(`SELECT COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE ai.result = 'APPROVED' AND ai.voided_at IS NULL)::int AS approved,
    COUNT(*) FILTER (WHERE ai.result = 'DEFECT' AND ai.voided_at IS NULL)::int AS defect,
    COUNT(*) FILTER (WHERE ai.voided_at IS NOT NULL)::int AS cancelled ${joins} ${where}`, params);
  const rows = await db.query(`SELECT ai.id, ai.qg_job_id AS job_id, ai.result, ai.qg_result, ai.attempt_no,
    ai.inspected_at, ai.voided_at, a.username AS inspector, j.task_type, m.fitment_id, m.chassis,
    m.model_description ${joins} ${where} ORDER BY ai.inspected_at DESC, ai.id DESC LIMIT 30 OFFSET $8`, [...params, (page - 1) * 30]);
  return { rows: rows.rows, summary: summary.rows[0], page, page_size: 30 };
};

const getAudit = async (req, auditId) => {
  const db = req.app.get('pool');
  const result = await db.query(`SELECT ai.*, ai.qg_job_id AS job_id, a.username AS inspector,
    v.username AS cancelled_by_name, j.task_type, j.status AS current_qg_status, m.fitment_id, m.chassis, m.model_description
    FROM audit_inspection ai JOIN admins a ON a.id = ai.audited_by
    LEFT JOIN admins v ON v.id = ai.voided_by
    JOIN qg_job j ON j.id = ai.qg_job_id JOIN masterlist m ON m.no = j.masterlist_id WHERE ai.id = $1`, [id(auditId)]);
  if (!result.rows[0]) throw fail(404, 'Audit check not found');
  const defects = await db.query(`SELECT d.*, COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'storage_key', p.storage_key, 'file_name', p.file_name) ORDER BY p.id)
    FROM audit_defect_photo p WHERE p.defect_id = d.id), '[]'::jsonb) AS photos
    FROM audit_inspection_defect d WHERE d.inspection_id = $1 ORDER BY d.sequence_no`, [auditId]);
  const { request_hash, idempotency_key, ...audit } = result.rows[0];
  return { ...audit, defects: defects.rows.map(d => ({ ...d, photos: d.photos.map(p => ({ id: p.id, file_name: p.file_name, url: getSignedReadUrl(p.storage_key) })) })) };
};

const getAuditJob = async (req, jobId) => {
  const job = await getJobDetail(req, id(jobId));
  if (!job) throw fail(404, 'Vehicle task not found');
  const history = await req.app.get('pool').query(`SELECT ai.id, ai.result, ai.inspected_at, ai.voided_at, ai.attempt_no, a.username AS inspector
    FROM audit_inspection ai JOIN admins a ON a.id = ai.audited_by WHERE ai.qg_job_id = $1 ORDER BY ai.id DESC`, [jobId]);
  return { job, history: history.rows };
};

const submitAudit = async (req, jobId, payload) => {
  requireWriter(req); id(jobId);
  const result = payload.result;
  const remark = String(payload.general_remark || '').trim();
  const key = String(payload.idempotency_key || '');
  const defects = payload.defects;
  if (!['APPROVED','DEFECT'].includes(result)) throw fail(400, 'Select Passed or Defect');
  if (!key || key.length > 100 || remark.length > 5000) throw fail(400, 'Invalid submission key or audit note');
  if (!Array.isArray(defects) || defects.length > 20 || (result === 'DEFECT' ? !defects.length : defects.length)) throw fail(400, 'Passed checks cannot contain defects; defect checks require findings');
  const hash = crypto.createHash('sha256').update(JSON.stringify([String(jobId), result, remark, defects])).digest('hex');
  const client = await req.app.get('pool').connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(`SELECT j.*, m.cancel_time FROM qg_job j JOIN masterlist m ON m.no = j.masterlist_id
      WHERE j.id = $1 AND m.cafi_date::date >= $2::date FOR UPDATE OF j`, [jobId, qgCafiStartDate()]);
    const job = locked.rows[0];
    if (!job || job.cancel_time) throw fail(404, 'Active vehicle task not found');
    const replay = await client.query('SELECT id, result, request_hash, voided_at FROM audit_inspection WHERE audited_by = $1 AND idempotency_key = $2', [req.user.id, key]);
    if (replay.rows[0]) {
      if (replay.rows[0].voided_at || replay.rows[0].request_hash !== hash) throw fail(409, 'This submission was cancelled or differs from the saved audit. Start a new audit.');
      await client.query('COMMIT');
      return { id: replay.rows[0].id, result: replay.rows[0].result };
    }
    const original = await client.query('SELECT id, result FROM qg_inspection WHERE id = $1 AND qg_job_id = $2 AND voided_at IS NULL', [job.latest_inspection_id, jobId]);
    const attempt = await client.query('SELECT COALESCE(MAX(attempt_no), 0) + 1 AS next FROM audit_inspection WHERE qg_job_id = $1', [jobId]);
    const saved = await client.query(`INSERT INTO audit_inspection (qg_job_id, qg_inspection_id, qg_result, attempt_no, result, audited_by, general_remark, idempotency_key, request_hash)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, result`, [jobId, original.rows[0]?.id || null, original.rows[0]?.result || null, attempt.rows[0].next, result, req.user.id, remark || null, key, hash]);
    for (const [index, defect] of defects.entries()) {
      if (!defect || typeof defect !== 'object') throw fail(400, 'Invalid defect');
      const issueId = id(defect.issue_id), descriptionId = id(defect.description_id), areaId = id(defect.area_id);
      const issue = await client.query("SELECT name FROM qg_defect_issue WHERE id = $1 AND is_active = TRUE AND task_type IN ($2, 'ALL')", [issueId, job.task_type]);
      const options = await client.query('SELECT id, name, category FROM qg_defect_option WHERE id = ANY($1::bigint[]) AND is_active = TRUE', [[descriptionId, areaId]]);
      const description = options.rows.find(o => String(o.id) === descriptionId && o.category === 'description');
      const area = options.rows.find(o => String(o.id) === areaId && o.category === 'area');
      if (!issue.rows[0] || !description || !area) throw fail(400, 'Select valid defect type, description and area');
      const partType = defect.parts_type;
      if (!['OE','ACCESSORIES'].includes(partType) || (partType === 'OE' ? defect.accessory_id != null : defect.oe_id != null)) throw fail(400, 'Select OE or Accessories');
      const partId = id(partType === 'OE' ? defect.oe_id : defect.accessory_id);
      const part = partType === 'OE'
        ? await client.query("SELECT name FROM qg_defect_option WHERE id = $1 AND category = 'oe' AND is_active = TRUE", [partId])
        : await client.query("SELECT COALESCE(short_name, 'Accessory') AS name FROM task_item WHERE no = $1 AND masterlist_id = $2 AND TRIM(type) = $3", [partId, job.masterlist_id, job.task_type]);
      if (!part.rows[0]) throw fail(400, 'Part is not available for this task');
      const note = String(defect.remark || '').trim();
      if (note.length > 5000 || !Array.isArray(defect.photos) || !defect.photos.length || defect.photos.length > 10) throw fail(400, 'Each defect needs 1–10 photos and a note under 5000 characters');
      const photos = defect.photos.map(p => verifyPhoto(p, jobId, req.user.id));
      const inserted = await client.query(`INSERT INTO audit_inspection_defect (inspection_id, sequence_no, issue_name, description_name, area_name, parts_type, part_name, remark)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [saved.rows[0].id, index + 1, issue.rows[0].name, description.name, area.name, partType, part.rows[0].name, note || null]);
      for (const photo of photos) await client.query(`INSERT INTO audit_defect_photo (defect_id, storage_key, file_name, content_type, file_size)
        VALUES ($1,$2,$3,$4,$5)`, [inserted.rows[0].id, photo.storage_key, photo.file_name, photo.content_type, photo.file_size]);
    }
    await client.query('COMMIT');
    return saved.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') throw fail(409, 'This audit submission was already used. Refresh the audit history.');
    throw error;
  } finally { client.release(); }
};

const cancelAudit = async (req, auditId, reason) => {
  requireWriter(req); id(auditId);
  const note = typeof reason === 'string' ? reason.trim() : '';
  if (!note || note.length > 1000) throw fail(400, 'Enter a cancellation reason (up to 1000 characters)');
  const db = req.app.get('pool');
  const cancelled = await db.query(`UPDATE audit_inspection SET voided_at = CURRENT_TIMESTAMP, voided_by = $2, void_reason = $3
    WHERE id = $1 AND voided_at IS NULL RETURNING id`, [auditId, req.user.id, note]);
  if (!cancelled.rows.length) {
    const exists = await db.query('SELECT id FROM audit_inspection WHERE id = $1', [auditId]);
    if (!exists.rows.length) throw fail(404, 'Audit check not found');
  }
  return { id: auditId, cancelled: true };
};
module.exports = { canWrite, requireWriter, lookupJobs, listAudits, getAudit, getAuditJob, submitAudit, cancelAudit };
