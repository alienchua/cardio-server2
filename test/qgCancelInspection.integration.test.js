const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { cancelInspection, submitInspection } = require('../modules/auth/v1/models/qgModel');

test('cancel requires admin permissions and a reason before accessing the database', async () => {
  const req = { user: { type: 'admin', role: 'qg', id: 1 }, app: { get() { throw new Error('Must not access database'); } } };
  await assert.rejects(cancelInspection(req, 1, 'Wrong result'), { status: 403 });
  req.user.role = 'admin';
  await assert.rejects(cancelInspection(req, 1, '  '), { status: 400 });
  await assert.rejects(cancelInspection(req, 1, 'a'.repeat(1001)), { status: 400 });
  await assert.rejects(cancelInspection(req, 'invalid', 'Wrong result'), { status: 400 });
});

test('cancel, retry, and corrected submission preserve history and reopen only the latest check', {
  skip: process.env.RUN_DB_TESTS !== '1'
}, async t => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  t.after(() => db.end());
  await db.query(`
    SET search_path TO pg_temp;
    CREATE TEMP TABLE masterlist (no bigint PRIMARY KEY, cafi_date date);
    CREATE TEMP TABLE qg_job (id bigint PRIMARY KEY, masterlist_id bigint, status text, latest_inspection_id bigint, updated_at timestamp);
    CREATE TEMP TABLE qg_inspection (
      id bigserial PRIMARY KEY, qg_job_id bigint, attempt_no int, result text, inspected_by bigint,
      inspected_at timestamp, device_scan_value text, idempotency_key text, general_remark text,
      voided_at timestamp, voided_by bigint, void_reason text,
      UNIQUE (qg_job_id, attempt_no), UNIQUE (inspected_by, idempotency_key)
    );
    CREATE TEMP TABLE qg_inspection_defect (id int, inspection_id bigint, remark text);
    CREATE TEMP TABLE qg_defect_photo (id int, defect_id int, storage_key text);
    INSERT INTO masterlist VALUES (1, '2026-10-02');
    INSERT INTO qg_job VALUES (1, 1, 'PENDING', NULL, NULL);
  `);
  const client = { query: (...args) => db.query(...args), release() {} };
  const req = { user: { type: 'admin', role: 'admin', id: 7 }, app: { get: () => ({ connect: async () => client }) } };
  const original = await submitInspection(req, 1, { result: 'APPROVED', idempotency_key: 'first' }, 7);
  const cancelled = await cancelInspection(req, original.id, 'Selected the wrong result');
  assert.equal(cancelled.status, 'PENDING');
  let job = (await db.query('SELECT * FROM qg_job')).rows[0];
  assert.equal(job.status, 'PENDING');
  assert.equal(job.latest_inspection_id, null);
  const audit = (await db.query('SELECT * FROM qg_inspection WHERE id = $1', [original.id])).rows[0];
  assert.ok(audit.voided_at);
  assert.equal(audit.voided_by, '7');
  assert.equal(audit.void_reason, 'Selected the wrong result');
  assert.equal(audit.result, 'APPROVED');
  assert.equal((await db.query('SELECT * FROM qg_inspection WHERE voided_at IS NULL')).rowCount, 0);
  await assert.rejects(submitInspection(req, 1, { result: 'APPROVED', idempotency_key: 'first' }, 7), { status: 409 });
  const corrected = await submitInspection(req, 1, { result: 'APPROVED', idempotency_key: 'corrected' }, 7);
  assert.equal(corrected.attempt_no, 2);
  assert.equal((await cancelInspection(req, original.id, 'Repeated request')).already_cancelled, true);
  job = (await db.query('SELECT * FROM qg_job')).rows[0];
  assert.equal(job.status, 'APPROVED');
  assert.equal(job.latest_inspection_id, corrected.id);
  // A stale active check must not reopen a job that has a newer result.
  await db.query("INSERT INTO qg_inspection(qg_job_id, attempt_no, result) VALUES (1, 3, 'DEFECT')");
  const latest = (await db.query('SELECT MAX(id) AS id FROM qg_inspection')).rows[0].id;
  await db.query("UPDATE qg_job SET latest_inspection_id = $1, status = 'DEFECT'", [latest]);
  await assert.rejects(cancelInspection(req, corrected.id, 'Stale page'), { status: 409 });
  await db.query("INSERT INTO qg_inspection_defect VALUES (1, $1, 'Evidence')", [latest]);
  await db.query("INSERT INTO qg_defect_photo VALUES (1, 1, 'retained-photo')");
  await cancelInspection(req, latest, 'Wrong defect');
  assert.equal((await db.query('SELECT * FROM qg_inspection_defect')).rowCount, 1);
  assert.equal((await db.query('SELECT * FROM qg_defect_photo')).rowCount, 1);
  assert.equal((await db.query('SELECT status FROM qg_job')).rows[0].status, 'PENDING');
  await assert.rejects(cancelInspection(req, 999, 'Missing'), { status: 404 });
});
