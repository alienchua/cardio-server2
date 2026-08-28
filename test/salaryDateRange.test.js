const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { getStaffTaskList } = require('../modules/auth/v1/models/tasksModel');

const captureStaffTaskQuery = async (month, staffId, options = {}) => {
  let captured;
  const req = {
    app: {
      get(name) {
        assert.equal(name, 'pool');
        return {
          async query(sql, values) {
            captured = { sql, values };
            return { rows: [] };
          }
        };
      }
    }
  };

  await getStaffTaskList(req, month, staffId, options);
  return captured;
};

const assertDenseParameters = ({ sql, values }) => {
  const indexes = [...new Set([...sql.matchAll(/\$(\d+)/g)].map((match) => Number(match[1])))].sort((a, b) => a - b);
  assert.deepEqual(indexes, values.map((_, index) => index + 1));
};

test('salary task date-range query uses a dense PostgreSQL parameter list', async () => {
  const captured = await captureStaffTaskQuery('2026-08', 42, {
    dateFrom: '2026-08-11',
    dateTo: '2026-08-11'
  });

  assertDenseParameters(captured);
  assert.deepEqual(captured.values, [42, '2026-08-11', '2026-08-11']);
});

test('salary task monthly query retains its month and staff parameters', async () => {
  const captured = await captureStaffTaskQuery('2026-08-01', 42);

  assertDenseParameters(captured);
  assert.deepEqual(captured.values, ['2026-08-01', 42]);
});

test('Express JSON error middleware is registered after API routes', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const authRouteIndex = server.indexOf("app.use('/auth', authRoutes)");
  const realtimeRouteIndex = server.indexOf("app.use('/realtime', websocketRoutes)");
  const errorHandlerIndex = server.indexOf('app.use(errorHandler)');

  assert.ok(authRouteIndex >= 0);
  assert.ok(realtimeRouteIndex >= 0);
  assert.ok(errorHandlerIndex > authRouteIndex);
  assert.ok(errorHandlerIndex > realtimeRouteIndex);
});
