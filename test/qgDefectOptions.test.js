const test = require('node:test');
const assert = require('node:assert/strict');
const { saveDefectOptions } = require('../modules/auth/v1/models/qgModel');
const router = require('../modules/auth/v1/routes/authRoutes');

test('QG list settings allow managers and existing editors while rejecting other roles', () => {
  const route = router.stack.find(layer => layer.route?.path === '/qg/defect-options/:category').route;
  const guard = route.stack[1].handle;
  for (const role of ['admin', 'manager', 'supervisor', 'superadmin', 'qg', 'installer', 'controller', 'warehouse', undefined]) {
    let allowed = false;
    let status;
    const res = { status(code) { status = code; return this; }, json() {} };
    guard({ user: { type: 'admin', role } }, res, () => { allowed = true; });
    assert.equal(allowed, ['admin', 'manager', 'supervisor', 'superadmin'].includes(role), String(role));
    if (!allowed) assert.equal(status, 403);
  }
});

const fakeRequest = () => {
  const queries = [];
  const client = {
    release() {},
    async query(sql, values) {
      queries.push({ sql, values });
      if (sql.includes('FOR UPDATE')) return { rows: [{ id: 1 }, { id: 2 }] };
      if (sql.includes('INSERT INTO qg_defect_option')) return { rows: [{ id: 3 }] };
      return { rows: [] };
    }
  };
  const pool = { connect: async () => client, query: async () => ({ rows: [] }) };
  return { req: { app: { get: () => pool } }, queries };
};

test('saves area edits and deactivates removed options in one transaction', async () => {
  const { req, queries } = fakeRequest();
  await saveDefectOptions(req, 'area', [{ id: 1, name: 'None' }, { name: 'Dashboard' }]);
  assert.equal(queries[0].sql, 'BEGIN');
  assert.match(queries.find((query) => query.sql.includes('NOT (id = ANY'))?.sql || '', /is_active = FALSE/);
  assert.deepEqual(queries.find((query) => query.sql.includes('NOT (id = ANY'))?.values, ['area', [1, 3]]);
  assert.equal(queries.at(-1).sql, 'COMMIT');
});

test('rejects duplicate option names and missing None', async () => {
  const { req, queries } = fakeRequest();
  await assert.rejects(saveDefectOptions(req, 'description', [{ name: 'DENT' }, { name: 'dent' }]), { status: 400 });
  await assert.rejects(saveDefectOptions(req, 'area', [{ name: 'Dashboard' }]), { status: 400 });
  assert.equal(queries.length, 0);
});

test('creates and orders OE options without requiring None', async () => {
  const { req, queries } = fakeRequest();
  const result = await saveDefectOptions(req, 'oe', [{ name: 'Dashboard' }, { id: 1, name: 'Door trim' }]);
  assert.deepEqual(queries.find(q => q.sql.includes('INSERT INTO qg_defect_option')).values, ['oe', 'Dashboard', 1]);
  assert.deepEqual(queries.find(q => q.sql.includes('NOT (id = ANY')).values, ['oe', [3, 1]]);
  assert.deepEqual(result.oe, []);
  assert.equal(queries.at(-1).sql, 'COMMIT');
});
