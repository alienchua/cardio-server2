const test = require('node:test');
const assert = require('node:assert/strict');

const { getStandbyList } = require('../modules/auth/v1/models/tasksModel');

test('standby list query sorts standard bays A-E naturally before other names', async () => {
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
