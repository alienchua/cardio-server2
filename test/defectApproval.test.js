const test = require('node:test');
const assert = require('node:assert/strict');
const { approveInspectionDefect: approveQgDefect } = require('../modules/auth/v1/models/qgModel');

const request = (query) => ({ user: { id: 9 }, app: { get: () => ({ query }) } });

test('QG approval rejects voided inspections and unrelated defects', async () => {
  const calls = [];
  const req = request(async (sql, values) => {
    calls.push({ sql, values });
    return { rows: [] };
  });
  await assert.rejects(approveQgDefect(req, 12, 23), (error) => error.status === 404);
  assert.deepEqual(calls[0].values, [12, 23, 9, '2026-09-28']);
  assert.match(calls[0].sql, /i\.id = \$1/);
  assert.match(calls[0].sql, /i\.voided_at IS NULL/);
  assert.match(calls[0].sql, /m\.cafi_date::date >= \$4::date/);
  assert.match(calls[0].sql, /d\.approved_at IS NULL/);
});

test('QG approval records one defect without changing the original inspection result', async () => {
  const calls = [];
  const req = request(async (sql) => {
    calls.push(sql);
    return { rows: [{ id: 23, approved_at: '2026-09-28T00:00:00Z' }] };
  });
  const result = await approveQgDefect(req, 12, 23);
  assert.equal(result.id, 23);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /UPDATE qg_inspection_defect/);
  assert.doesNotMatch(calls[0], /SET result/);
});
