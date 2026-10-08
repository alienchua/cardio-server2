const assert = require('node:assert/strict');
const test = require('node:test');
const { getSalaryResult } = require('../modules/auth/v1/models/salaryModel');

test('salary date range limits staff to work or offsets in the selected days', async () => {
  let captured;
  const req = { app: { get: () => ({ query: async (sql, values) => {
    captured = { sql, values };
    return { rows: [] };
  } }) } };

  await getSalaryResult(req, '2026-09', { dateFrom: '2026-09-04', dateTo: '2026-09-10' });

  assert.deepEqual(captured.values.slice(-2), ['2026-09-04', '2026-09-10']);
  assert.match(captured.sql, /c\.checkin_time >= \$3::date AND c\.checkin_time < \(\$4::date \+ INTERVAL '1 day'\)/);
  assert.match(captured.sql, /JOIN selectdata sd ON sd\.checkin_no = cs\.checkin_id/);
  assert.match(captured.sql, /JOIN selectdata range_task ON range_task\.checkin_no = range_cs\.checkin_id/);
  assert.match(captured.sql, /OR b2\.staff_id IS NOT NULL/);
});
