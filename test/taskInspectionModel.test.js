const test = require('node:test');
const assert = require('node:assert/strict');
const { getTaskInspectionSummaries } = require('../modules/auth/v1/models/taskInspectionModel');

test('adds the latest CA and QG results to the correct task and work type', async () => {
  const queries = [];
  const req = { app: { get: () => ({ query: async (sql, values) => {
    queries.push({ sql, values });
    if (sql.includes('JOIN ca_case c ON')) return { rows: [
      { masterlist_id: 12, task_type: 'FITMENT', result: 'DEFECT' },
      { masterlist_id: 12, task_type: 'HOIST', result: 'APPROVED' }
    ] };
    return { rows: [
      { masterlist_id: 12, task_type: 'FITMENT', status: 'APPROVED', result: 'APPROVED' },
      { masterlist_id: 13, task_type: 'FITMENT', status: 'PENDING', result: null }
    ] };
  } }) } };
  const rows = await getTaskInspectionSummaries(req, [
    { no: 12, type: 'FITMENT' }, { no: 12, type: 'HOIST' }, { no: 13, type: 'FITMENT' }
  ]);
  assert.deepEqual(rows.map(({ ca_result, qg_result, qg_status }) => ({ ca_result, qg_result, qg_status })), [
    { ca_result: 'DEFECT', qg_result: 'APPROVED', qg_status: 'APPROVED' },
    { ca_result: 'APPROVED', qg_result: null, qg_status: null },
    { ca_result: null, qg_result: null, qg_status: 'PENDING' }
  ]);
  assert.equal(queries.length, 2);
  assert.deepEqual(queries[0].values, [[12, 12, 13], ['FITMENT', 'HOIST', 'FITMENT']]);
  assert.match(queries[0].sql, /c\.work_type = k\.task_type/);
  assert.match(queries[0].sql, /c\.masterlist_id IS NULL/);
  assert.match(queries[0].sql, /c\.fitment_id/);
  assert.match(queries[0].sql, /c\.chassis/);
  assert.match(queries[1].sql, /i\.voided_at IS NULL/);
  assert.match(queries[1].sql, /m\.cafi_date::date >= \$3::date/);
  assert.deepEqual(queries[1].values, [[12, 12, 13], ['FITMENT', 'HOIST', 'FITMENT'], '2026-09-28']);
});
