const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getStandbyList,
  updateCheckInNew,
  updatePickupTime
} = require('../modules/auth/v1/models/tasksModel');

test('check-in standby list query sorts standard bays A-E naturally before other names', async () => {
  let capturedQuery = '';
  const req = {
    app: {
      get: () => ({
        query: async (query) => {
          capturedQuery = query;
          return { rows: [] };
        }
      })
    }
  };

  await getStandbyList(req);

  const normalizedQuery = capturedQuery.replace(/\s+/g, ' ').trim();
  assert.match(normalizedQuery, /ORDER BY CASE WHEN UPPER\(TRIM\(b\.name\)\) ~ '\^\[A-E\]\[0-9\]\+\$' THEN 0 ELSE 1 END/);
  assert.match(normalizedQuery, /LEFT\(UPPER\(TRIM\(b\.name\)\), 1\) ASC/);
  assert.match(normalizedQuery, /SUBSTRING\(UPPER\(TRIM\(b\.name\)\) FROM 2\)::INTEGER ELSE NULL END ASC/);
  assert.match(normalizedQuery, /UPPER\(TRIM\(COALESCE\(b\.name, ''\)\)\) ASC/);
  assert.match(normalizedQuery, /c\.created_at ASC, c\.no ASC$/);
});

test('standby screen query puts Ready parts before all other part statuses', async () => {
  let capturedQuery = '';
  const req = {
    app: {
      get: () => ({
        query: async (query) => {
          capturedQuery = query;
          return { rows: [] };
        }
      })
    }
  };

  const { getStandyList } = require('../modules/auth/v1/models/tasksModel');
  await getStandyList(req, 'FITMENT');

  const normalizedQuery = capturedQuery.replace(/\s+/g, ' ').trim();
  assert.match(
    normalizedQuery,
    /ORDER BY CASE WHEN UPPER\(TRIM\(COALESCE\(c\.accessory_status, ''\)\)\) = 'READY' THEN 0 ELSE 1 END ASC, c\.no ASC;/
  );
});

test('converting standby to check-in leaves the check-in time unset for staff pickup', async () => {
  let capturedQuery = '';
  let capturedValues = [];
  const req = {
    app: {
      get: () => ({
        query: async (query, values) => {
          capturedQuery = query;
          capturedValues = values;
          return { rows: [{ no: 17 }] };
        }
      })
    }
  };

  await updateCheckInNew(req, 17, 4);

  const normalizedQuery = capturedQuery.replace(/\s+/g, ' ').trim();
  assert.match(normalizedQuery, /SET status = 'Check-In', bay_id = \$2/);
  assert.doesNotMatch(normalizedQuery, /checkin_time\s*=/);
  assert.deepEqual(capturedValues, [17, 4]);
});

test('staff pickup records the actual check-in time', async () => {
  let capturedQuery = '';
  let capturedValues = [];
  const req = {
    app: {
      get: () => ({
        query: async (query, values) => {
          capturedQuery = query;
          capturedValues = values;
          return { rows: [{ no: 17 }] };
        }
      })
    }
  };

  await updatePickupTime(req, 17);

  const normalizedQuery = capturedQuery.replace(/\s+/g, ' ').trim();
  assert.match(normalizedQuery, /UPDATE checkin SET checkin_time = CURRENT_TIMESTAMP WHERE no = \$1/);
  assert.deepEqual(capturedValues, [17]);
});
