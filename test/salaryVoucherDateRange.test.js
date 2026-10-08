const assert = require('node:assert/strict');
const test = require('node:test');
const { getStaffTaskList } = require('../modules/auth/v1/models/tasksModel');
const { getSalaryDetail } = require('../modules/auth/v1/models/salaryModel');

const captureQuery = async (run) => {
  let captured;
  const req = { app: { get: () => ({ query: async (sql, values) => {
    captured = { sql, values };
    return { rows: [] };
  } }) } };
  await run(req);
  return captured;
};

test('voucher task detail binds only staff and selected dates in range mode', async () => {
  const query = await captureQuery((req) => getStaffTaskList(req, '2026-09-01', 42, {
    dateFrom: '2026-09-01', dateTo: '2026-09-29'
  }));
  assert.deepEqual(query.values, [42, '2026-09-01', '2026-09-29']);
  assert.match(query.sql, /selected_staff\.staff_id = \$1/);
  assert.match(query.sql, /c\.checkin_time >= \$2::date/);
  assert.match(query.sql, /c\.checkin_time < \(\$3::date \+ INTERVAL '1 day'\)/);
  assert.doesNotMatch(query.sql, /\$4/);
});

test('voucher task detail still binds staff and month in month mode', async () => {
  const query = await captureQuery((req) => getStaffTaskList(req, '2026-09-01', 42));
  assert.deepEqual(query.values, [42, '2026-09-01']);
  assert.match(query.sql, /c\.checkin_time >= \$2::date/);
  assert.match(query.sql, /c\.checkin_time < \(\$2::date \+ INTERVAL '1 month'\)/);
  assert.doesNotMatch(query.sql, /\$3/);
});

test('legacy salary detail uses the same complete parameter binding', async () => {
  const range = await captureQuery((req) => getSalaryDetail(req, '2026-09', 42, {
    dateFrom: '2026-09-01', dateTo: '2026-09-29'
  }));
  assert.deepEqual(range.values, [42, '2026-09-01', '2026-09-29']);
  assert.match(range.sql, /selected_cs\.staff_id = \$1/);
  assert.match(range.sql, /c\.checkin_time >= \$2::date/);
  assert.match(range.sql, /c\.checkin_time < \(\$3::date \+ INTERVAL '1 day'\)/);
  assert.doesNotMatch(range.sql, /\$4/);
});
