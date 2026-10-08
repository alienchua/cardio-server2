const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { cancelCheckinWithArchive } = require('../modules/auth/v1/models/tasksModel');

// Run with RUN_DB_TESTS=1. Every table is session-local; no application data is changed.
async function fixture(t, inspected = false, withJob = true) {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  t.after(() => db.end());
  await db.query(`
    SET search_path TO pg_temp;
    CREATE TEMP TABLE checkin (
      no bigint PRIMARY KEY, masterlist_id bigint, bay_id bigint, status text,
      created_at timestamp, checkout_time timestamp, remark text, type text,
      checkin_time timestamp, accessory_status text, accessory_pickup text,
      showaccessories boolean, preparing_time timestamp
    );
    CREATE TEMP TABLE cencellcheckin AS SELECT *, no AS checkin_id, no AS action_by FROM checkin WITH NO DATA;
    CREATE TEMP TABLE checkin_staff (checkin_id bigint REFERENCES checkin(no));
    CREATE TEMP TABLE qg_job (id bigint PRIMARY KEY, source_checkin_id bigint REFERENCES checkin(no), status text);
    CREATE TEMP TABLE qg_inspection (id bigint PRIMARY KEY, qg_job_id bigint REFERENCES qg_job(id));
    INSERT INTO checkin (no, masterlist_id, status, type) VALUES (1, 10, 'Check-In', 'FITMENT'), (2, 20, 'Check-In', 'HOIST');
    INSERT INTO checkin_staff VALUES (1), (2);
    INSERT INTO qg_job VALUES (2, 2, 'PENDING');
  `);
  if (withJob) await db.query("INSERT INTO qg_job VALUES (1, 1, 'PENDING')");
  if (inspected) await db.query('INSERT INTO qg_inspection VALUES (1, 1)');
  const req = { app: { get: () => ({ connect: async () => ({ query: (...args) => db.query(...args), release() {} }) }) } };
  return { db, req };
}

for (const withJob of [false, true]) {
  test(`cancels and archives check-in with ${withJob ? 'a pending QG job' : 'no QG job'}`, { skip: process.env.RUN_DB_TESTS !== '1' }, async t => {
    const { db, req } = await fixture(t, false, withJob);
    const result = await cancelCheckinWithArchive(req, { checkin_id: 1, action_by: 4, remark: 'Cancel test' });
    assert.equal(result.archived.remark, 'Cancel test');
    assert.equal(result.deleted.no, '1');
    assert.deepEqual((await db.query('SELECT no FROM checkin')).rows, [{ no: '2' }]);
    assert.deepEqual((await db.query('SELECT checkin_id FROM checkin_staff')).rows, [{ checkin_id: '2' }]);
    assert.deepEqual((await db.query('SELECT id FROM qg_job')).rows, [{ id: '2' }]);
  });
}

test('preserves inspection history and rolls back cancellation when QG was inspected', { skip: process.env.RUN_DB_TESTS !== '1' }, async t => {
  const { db, req } = await fixture(t, true);
  await assert.rejects(cancelCheckinWithArchive(req, { checkin_id: 1, action_by: 4, remark: 'Cancel test' }), error => error.statusCode === 409);
  for (const table of ['checkin', 'checkin_staff', 'qg_job']) {
    assert.equal((await db.query(`SELECT count(*)::int AS count FROM ${table}`)).rows[0].count, 2);
  }
  assert.equal((await db.query('SELECT count(*)::int AS count FROM cencellcheckin')).rows[0].count, 0);
  assert.equal((await db.query('SELECT count(*)::int AS count FROM qg_inspection')).rows[0].count, 1);
});

test('restores the pending QG job if archiving fails', { skip: process.env.RUN_DB_TESTS !== '1' }, async t => {
  const { db, req } = await fixture(t);
  await db.query("ALTER TABLE cencellcheckin ADD CHECK (remark <> 'Fail archive')");
  await assert.rejects(cancelCheckinWithArchive(req, { checkin_id: 1, action_by: 4, remark: 'Fail archive' }), error => error.code === '23514');
  for (const table of ['checkin', 'checkin_staff', 'qg_job']) {
    assert.equal((await db.query(`SELECT count(*)::int AS count FROM ${table}`)).rows[0].count, 2);
  }
});

test('returns not found for an already cancelled check-in', { skip: process.env.RUN_DB_TESTS !== '1' }, async t => {
  const { req } = await fixture(t);
  await cancelCheckinWithArchive(req, { checkin_id: 1, action_by: 4, remark: 'Cancel test' });
  await assert.rejects(cancelCheckinWithArchive(req, { checkin_id: 1, action_by: 4, remark: 'Cancel again' }), error => error.statusCode === 404);
});
