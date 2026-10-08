const test = require('node:test');
const assert = require('node:assert/strict');
const { syncEligibleQgJobs } = require('../modules/auth/v1/models/qgModel');

test('QG eligibility starts at check-in for CAFI dates from 28 September', async () => {
  let captured;
  const db = { query: async (sql, values) => {
    captured = { sql, values };
    return { rows: [] };
  } };

  await syncEligibleQgJobs(db, 42);

  assert.deepEqual(captured.values, ['2026-09-28', 42]);
  assert.match(captured.sql, /status IN \('Check-In', 'Check-Out'\)/);
  assert.match(captured.sql, /m\.cafi_date::date >= \$1::date/);
  assert.match(captured.sql, /m\.cafi_date::date < \$1::date/);
  assert.match(captured.sql, /NOT EXISTS \(SELECT 1 FROM qg_inspection/);
  assert.match(captured.sql, /'PENDING'/);
  assert.match(captured.sql, /COALESCE\(checkin_time, created_at \+ INTERVAL '8 hours'\) AS checkin_at/);
  assert.doesNotMatch(captured.sql, /checkout_time IS NOT NULL/);
});
