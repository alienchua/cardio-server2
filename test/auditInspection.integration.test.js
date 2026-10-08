const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');
const model = require('../modules/auth/v1/models/auditModel');
const { latestAuditSql } = require('../modules/auth/v1/models/auditSummarySql');

test('only supervisors and superadmins can write audit checks', async () => {
  for (const role of ['qg', 'admin', 'manager', 'staff', undefined]) {
    const req = { user: { type: 'admin', role, id: 1 } };
    await assert.rejects(model.submitAudit(req, 1, {}), { status: 403 });
    await assert.rejects(model.cancelAudit(req, 1, 'Mistake'), { status: 403 });
  }
  assert.equal(model.canWrite({ user: { type: 'user', role: 'supervisor' } }), false);
  assert.equal(model.canWrite({ user: { type: 'admin', role: 'superadmin' } }), true);
});
test('invalid audit report dates and filters fail before querying', async () => {
  await assert.rejects(model.listAudits({}, { date_from: '2026-02-30' }), { status: 400 });
  await assert.rejects(model.listAudits({}, { date_from: '2026-10-03', date_to: '2026-10-02' }), { status: 400 });
  await assert.rejects(model.listAudits({}, { result: 'OTHER' }), { status: 400 });
});

test('audit lifecycle preserves QG, validates evidence, retries safely, and reports Malaysia days', {
  skip: process.env.RUN_DB_TESTS !== '1'
}, async t => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect(); t.after(() => db.end());
  await db.query(`SET search_path TO pg_temp;
    CREATE TEMP TABLE admins(id bigint PRIMARY KEY, username text);
    CREATE TEMP TABLE masterlist(no bigint PRIMARY KEY, fitment_id text, chassis text, model_description text, cafi_date date, cancel_time timestamp);
    CREATE TEMP TABLE qg_job(id bigint PRIMARY KEY, masterlist_id bigint, task_type text, status text, latest_inspection_id bigint);
    CREATE TEMP TABLE qg_inspection(id bigint PRIMARY KEY, qg_job_id bigint, result text, voided_at timestamp);
    CREATE TEMP TABLE qg_defect_issue(id bigint PRIMARY KEY, name text, task_type text, is_active boolean);
    CREATE TEMP TABLE qg_defect_option(id bigint PRIMARY KEY, name text, category text, is_active boolean);
    CREATE TEMP TABLE task_item(no bigint PRIMARY KEY, masterlist_id bigint, type text, short_name text);
    INSERT INTO admins VALUES (1,'Supervisor One'),(2,'QG Inspector');
    INSERT INTO masterlist VALUES (1,'V-AUDIT-TEST','TEST-CHASSIS','Test car','2026-10-02',NULL);
    INSERT INTO qg_job VALUES (1,1,'FITMENT','APPROVED',10);
    INSERT INTO qg_inspection VALUES (10,1,'APPROVED',NULL);
    INSERT INTO qg_defect_issue VALUES (1,'Installation','ALL',true);
    INSERT INTO qg_defect_option VALUES (2,'Loose','description',true),(3,'Front','area',true),(4,'OE part','oe',true);
    INSERT INTO task_item VALUES (5,1,'FITMENT','Accessory');
  `);
  await db.query(fs.readFileSync(path.join(__dirname, '../postgreSQL/audit_check.sql'), 'utf8'));
  // Migration is safe to rerun and does not overwrite records.
  await db.query(fs.readFileSync(path.join(__dirname, '../postgreSQL/audit_check.sql'), 'utf8'));
  const req = { user: { type: 'admin', role: 'supervisor', id: 1 }, app: { get: () => ({ query: (...args) => db.query(...args), connect: async () => ({ query: (...args) => db.query(...args), release() {} }) }) } };
  const qgBefore = (await db.query('SELECT * FROM qg_job')).rows;
  const inspectionsBefore = (await db.query('SELECT * FROM qg_inspection')).rows;
  const passed = { result: 'APPROVED', general_remark: 'Sample audit', idempotency_key: 'pass', defects: [] };
  const first = await model.submitAudit(req, 1, passed);
  assert.deepEqual(await model.submitAudit(req, 1, passed), first);
  await assert.rejects(model.submitAudit(req, 1, { ...passed, general_remark: 'Changed after save' }), { status: 409 });
  const oldSecret = process.env.JWT_SECRET; process.env.JWT_SECRET = 'audit-test-secret-only';
  t.after(() => { if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret; });
  const photo = { storage_key: 'audit/defects/1/test.png', file_name: 'test.png', content_type: 'image/png', file_size: 100 };
  const receipt = audience => jwt.sign({ photo, jobId: '1', userId: '1' }, process.env.JWT_SECRET, { audience, expiresIn: '1h' });
  const finding = { issue_id: 1, description_id: 2, area_id: 3, parts_type: 'ACCESSORIES', accessory_id: 5, remark: 'Loose part', photos: [{ upload_token: receipt('audit-photo') }] };
  const defect = { result: 'DEFECT', idempotency_key: 'defect', defects: [finding] };
  await assert.rejects(model.submitAudit(req, 1, { ...defect, idempotency_key: 'bad-photo', defects: [{ ...finding, photos: [{ upload_token: receipt('qg-photo') }] }] }), { status: 400 });
  await assert.rejects(model.submitAudit(req, 1, { ...defect, idempotency_key: 'bad-part', defects: [{ ...finding, accessory_id: 999 }] }), { status: 400 });
  assert.equal((await db.query('SELECT * FROM audit_inspection')).rowCount, 1, 'failed findings roll back the entire audit');
  const second = await model.submitAudit(req, 1, defect);
  assert.deepEqual(await model.submitAudit(req, 1, defect), second);
  const detail = await model.getAudit(req, second.id);
  assert.equal(detail.qg_result, 'APPROVED'); assert.equal(detail.qg_inspection_id, '10');
  assert.equal(detail.result, 'DEFECT'); assert.equal(detail.defects[0].part_name, 'Accessory'); assert.equal(detail.defects[0].photos.length, 1);
  const flag = () => db.query(`SELECT ${latestAuditSql('j.id')} AS audit FROM qg_job j WHERE j.id = 1`);
  assert.equal((await flag()).rows[0].audit.result, 'DEFECT');
  await db.query("UPDATE audit_inspection SET inspected_at = CASE WHEN id = $1 THEN '2026-10-02 15:59:59+00'::timestamptz ELSE '2026-10-02 16:00:00+00'::timestamptz END", [first.id]);
  for (const zone of ['UTC', 'Asia/Kuala_Lumpur', 'America/Los_Angeles']) {
    await db.query("SELECT set_config('TimeZone', $1, false)", [zone]);
    const oct2 = await model.listAudits(req, { date_from: '2026-10-02' });
    const oct3 = await model.listAudits(req, { date_from: '2026-10-03', result: 'DEFECT', task_type: 'FITMENT', auditor_id: '1' });
    assert.equal(oct2.summary.approved, 1); assert.equal(oct2.summary.defect, 0);
    assert.equal(oct3.summary.defect, 1);
  }
  const lookup = await model.lookupJobs(req, 'V-AUDIT-TEST'); assert.equal(lookup[0].audit_result, 'DEFECT');
  await assert.rejects(model.cancelAudit(req, second.id, ' '), { status: 400 });
  await model.cancelAudit(req, second.id, 'Wrong finding');
  await model.cancelAudit(req, second.id, 'Repeat click');
  const cancelled = await model.getAudit(req, second.id);
  assert.equal(cancelled.void_reason, 'Wrong finding'); assert.ok(cancelled.voided_at); assert.equal(cancelled.defects[0].photos.length, 1);
  assert.equal((await flag()).rows[0].audit.result, 'APPROVED');
  assert.equal((await model.listAudits(req, { date_from: '2026-10-03' })).summary.total, 0);
  assert.equal((await model.listAudits(req, { date_from: '2026-10-03', include_cancelled: 'true' })).summary.cancelled, 1);
  await assert.rejects(model.submitAudit(req, 1, defect), { status: 409 });
  assert.deepEqual((await db.query('SELECT * FROM qg_job')).rows, qgBefore);
  assert.deepEqual((await db.query('SELECT * FROM qg_inspection')).rows, inspectionsBefore);
});
