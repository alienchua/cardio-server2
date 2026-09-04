const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getDailyVehicleModelSummary,
  getHourlyCompletedStats
} = require('../modules/auth/v1/models/tasksModel');

test('vehicle model summary is scoped by final task Check-Out and returns V/A/J totals', async () => {
  let capturedQuery = '';
  let capturedValues = [];
  const expectedRows = [
    { model: 'VIOS 1.5G AT', qty: 8, v: 5, a: 1, j: 2 }
  ];
  const req = {
    app: {
      get(name) {
        assert.equal(name, 'pool');
        return {
          async query(query, values) {
            capturedQuery = query;
            capturedValues = values;
            return { rows: expectedRows };
          }
        };
      }
    }
  };

  const rows = await getDailyVehicleModelSummary(req, '2026-09-03');

  assert.deepEqual(rows, expectedRows);
  assert.deepEqual(capturedValues, ['2026-09-03']);
  assert.doesNotMatch(capturedQuery, /cafi_date\s*=\s*\$1::date/);
  assert.match(capturedQuery, /cancel_time IS NULL/);
  assert.match(capturedQuery, /fitment_type = 'V'/);
  assert.match(capturedQuery, /fitment_type = 'A'/);
  assert.match(capturedQuery, /fitment_type = 'J'/);
  assert.match(capturedQuery, /AS std_ct/);
  assert.match(capturedQuery, /AS act_ct/);
  assert.match(capturedQuery, /AS avg_time/);
  assert.match(capturedQuery, /AS completed_qty/);
  assert.match(capturedQuery, /AS within_std/);
  assert.match(capturedQuery, /AS over_std/);
  assert.doesNotMatch(capturedQuery, /AS unmeasurable_qty/);
  assert.match(capturedQuery, /AS avg_std_time/);
  assert.doesNotMatch(capturedQuery, /official_caout_summary AS/);
  assert.match(capturedQuery, /checked_out_qty/);
  assert.match(capturedQuery, /has_valid_timing AND act_minutes <= std_minutes/);
  assert.match(capturedQuery, /has_valid_timing AND act_minutes > std_minutes/);
  assert.match(capturedQuery, /WHERE is_completed AND completed_at/);
  assert.match(capturedQuery, /c\.status = 'Check-Out'/);
});

test('vehicle model and hourly summaries accept inclusive date ranges', async () => {
  const calls = [];
  const req = {
    app: {
      get() {
        return {
          async query(query, values) {
            calls.push({ query, values });
            return { rows: [] };
          }
        };
      }
    }
  };

  await getDailyVehicleModelSummary(req, '2026-09-01', '2026-09-04');
  await getHourlyCompletedStats(req, '2026-09-01', '2026-09-04');

  assert.equal(calls.length, 6);
  for (const call of calls) {
    assert.deepEqual(call.values, ['2026-09-01', '2026-09-04']);
  }
  assert.match(calls[0].query, /completed_at >= \$1::date AND completed_at < \$2::date \+ INTERVAL '1 day'/);
  for (const call of calls.slice(1)) assert.match(call.query, /BETWEEN \$1::date AND \$2::date/);
});

test('hourly completed stats use the selected date for every query', async () => {
  const calls = [];
  const req = {
    app: {
      get() {
        return {
          async query(query, values) {
            calls.push({ query, values });
            return { rows: [] };
          }
        };
      }
    }
  };

  await getHourlyCompletedStats(req, '2026-09-02');

  assert.equal(calls.length, 5);
  for (const call of calls) {
    assert.deepEqual(call.values, ['2026-09-02']);
    assert.match(call.query, /\$1::date/);
    assert.match(call.query, /m\.cancel_time IS NULL/);
    assert.doesNotMatch(call.query, /CURRENT_DATE/);
  }
  assert.match(calls[0].query, /c\.checkout_time/);
  assert.match(calls[1].query, /c\.checkout_time/);
  assert.match(calls[2].query, /m\.caout_date/);
  assert.match(calls[2].query, /m\.caout_time/);
  assert.match(calls[3].query, /COUNT\(\*\)::int AS count/);
  assert.match(calls[3].query, /AS v/);
  assert.match(calls[3].query, /AS a/);
  assert.match(calls[3].query, /AS j/);
  assert.match(calls[4].query, /m\.cafi_date/);
  assert.match(calls[4].query, /m\.caout_date IS NULL/);
  assert.match(calls[4].query, /m\.cancel_time IS NULL/);
});
