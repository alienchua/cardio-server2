const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getBayPerformanceAnalytics,
  getBayPerformanceSummary
} = require('../modules/auth/v1/models/bayModel');

const createRequest = (calls, rows = []) => ({
  app: {
    get(name) {
      assert.equal(name, 'pool');
      return {
        async query(query, values) {
          calls.push({ query, values });
          return { rows };
        }
      };
    }
  }
});

test('bay dashboard summary groups valid task Check-Outs by bay over an inclusive range', async () => {
  const calls = [];
  const expectedRows = [{ bay_id: 1, bay_name: 'A1', checked_out_tasks: 8 }];
  const result = await getBayPerformanceSummary(
    createRequest(calls, expectedRows),
    '2026-09-01',
    '2026-09-04'
  );

  assert.deepEqual(result, expectedRows);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].values, ['2026-09-01', '2026-09-04']);
  assert.match(calls[0].query, /c\.status = 'Check-Out'/);
  assert.match(calls[0].query, /TRIM\(c\.type\) IN \('FITMENT', 'HOIST'\)/);
  assert.match(calls[0].query, /m\.cancel_time IS NULL/);
  assert.match(calls[0].query, /c\.checkout_time >= \$1::date/);
  assert.match(calls[0].query, /c\.checkout_time < \(\$2::date \+ INTERVAL '1 day'\)/);
  assert.match(calls[0].query, /AS checked_out_tasks/);
  assert.match(calls[0].query, /AS total_std_time/);
  assert.match(calls[0].query, /AS total_act_time/);
  assert.match(calls[0].query, /AS avg_std_time/);
  assert.match(calls[0].query, /AS avg_act_time/);
  assert.match(calls[0].query, /AS within_std/);
  assert.match(calls[0].query, /AS over_std/);
});

test('detailed bay performance uses the same completed and non-cancelled checkout scope', async () => {
  const calls = [];
  await getBayPerformanceAnalytics(createRequest(calls), '2026-09-04', null, '2026-09-06', 'A1', 'fitment');

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].values, ['2026-09-04', null, '2026-09-06', 'A1', 'fitment']);
  assert.match(calls[0].query, /c\.status = 'Check-Out'/);
  assert.match(calls[0].query, /c\.checkout_time >= \$1::date/);
  assert.match(calls[0].query, /COALESCE\(\$3::date, \$1::date\)/);
  assert.match(calls[0].query, /b\.name = \$4/);
  assert.match(calls[0].query, /m\.cafi_date >= \$1::date/);
  assert.match(calls[0].query, /m\.cancel_time IS NULL/);
  assert.match(calls[0].query, /m\.accessories_otp/);
  assert.match(calls[0].query, /AS accessory_names/);
});
