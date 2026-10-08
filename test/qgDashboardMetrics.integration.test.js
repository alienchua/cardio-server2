const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { getDashboard } = require('../modules/auth/v1/models/qgModel');
const { getOverview } = require('../modules/auth/v1/models/qgOverviewModel');

// Explicit opt-in; fixtures use session-local tables and never modify application data.
test('dashboard metrics count findings, preserve scope, and handle first checks and empty periods', {
  skip: process.env.RUN_DB_TESTS !== '1'
}, async (t) => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  t.after(() => db.end());
  await db.query(`
    SET search_path TO pg_temp;
    CREATE TEMP TABLE qg_inspection (id int, qg_job_id int, result text, inspected_at timestamp, inspected_by int, voided_at timestamp);
    CREATE TEMP TABLE qg_job (id int, masterlist_id int, source_checkin_id int, task_type text);
    CREATE TEMP TABLE masterlist (no int, fitment_id text, cafi_date date);
    CREATE TEMP TABLE checkin (no int, bay_id int);
    CREATE TEMP TABLE bay (no int, name text);
    CREATE TEMP TABLE admins (id int, username text);
    CREATE TEMP TABLE qg_inspection_defect (id int, inspection_id int);
    INSERT INTO admins VALUES (1, 'One'), (2, 'Two');
    INSERT INTO bay VALUES (1, 'Bay 1');
    INSERT INTO checkin VALUES (1, 1), (2, NULL);
    INSERT INTO masterlist VALUES (1, 'V1', '2026-09-28'), (2, 'A2', '2026-09-28');
    INSERT INTO qg_job VALUES (1, 1, 1, 'FITMENT'), (2, 2, 2, 'HOIST');
    INSERT INTO qg_inspection VALUES
      (1, 1, 'DEFECT', '2026-09-29 08:00', 1, NULL),
      (2, 1, 'APPROVED', '2026-09-29 09:00', 2, NULL),
      (3, 2, 'DEFECT', '2026-09-29 10:00', 2, NULL),
      (4, 2, 'DEFECT', '2026-09-29 11:00', 2, '2026-09-29 12:00');
    INSERT INTO qg_inspection_defect VALUES (1, 1), (2, 1), (3, 3), (4, 4);
  `);
  // Execute the production aggregate query against Postgres. Other endpoint queries
  // are irrelevant to these metrics and deliberately return no application data.
  const request = (role, id = 1) => ({ user: { role, id }, app: { get: () => ({
    query: (sql, params) => sql.includes('AS quality_summary') ? db.query(sql, params) : Promise.resolve({ rows: [] })
  }) } });
  const filters = { date_from: '2026-09-29', date_to: '2026-09-29' };
  const all = await getDashboard(request('admin'), filters);
  assert.deepEqual(all.quality_summary, { completed: 3, defect_count: 3 });
  assert.equal(all.inspector_summary.find(row => row.inspector_id === 2).completed, 2);
  assert.equal(all.inspector_summary.find(row => row.inspector_id === 1).defect_count, 2);
  assert.equal(all.defects_by_bay.find(row => row.bay_id === null).defect_count, 1);
  const mine = await getDashboard(request('qg'), filters);
  assert.deepEqual(mine.quality_summary, { completed: 1, defect_count: 2 });
  assert.equal(mine.inspector_summary.length, 1);
  const first = await getOverview(request('admin'), filters);
  assert.deepEqual(first.quality_summary, { completed: 2, defect_count: 3 });
  assert.equal(first.quality_summary.defect_count / first.quality_summary.completed, 1.5);
  assert.equal(first.inspector_summary.find(row => row.inspector_id === 2).completed, 1);
  const fitment = await getOverview(request('admin'), { ...filters, task_type: 'FITMENT' });
  assert.deepEqual(fitment.quality_summary, { completed: 1, defect_count: 2 });
  for (const get of [getDashboard, getOverview]) {
    const empty = await get(request('admin'), { date_from: '2026-10-01', date_to: '2026-10-01' });
    assert.deepEqual(empty.quality_summary, { completed: 0, defect_count: 0 });
    assert.deepEqual(empty.inspector_summary, []);
  }
});
