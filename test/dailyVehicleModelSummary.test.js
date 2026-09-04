const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getDailyVehicleModelSummary,
  getHourlyCompletedStats
} = require('../modules/auth/v1/models/tasksModel');

test('daily vehicle model summary is scoped by CAFI date and returns V/A/J totals', async () => {
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
  assert.match(capturedQuery, /cafi_date\s*=\s*\$1::date/);
  assert.match(capturedQuery, /cancel_time IS NULL/);
  assert.match(capturedQuery, /fitment_type = 'V'/);
  assert.match(capturedQuery, /fitment_type = 'A'/);
  assert.match(capturedQuery, /fitment_type = 'J'/);
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

  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.deepEqual(call.values, ['2026-09-02']);
    assert.match(call.query, /\$1::date/);
    assert.doesNotMatch(call.query, /CURRENT_DATE/);
  }
});
