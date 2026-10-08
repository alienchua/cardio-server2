const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const sinon = require('sinon');
const jwt = require('jsonwebtoken');
const auth = require('../middlewares/auth');
const requireAdminAccount = require('../middlewares/requireAdminAccount');

afterEach(() => sinon.restore());

async function authorize(user, rows = [{ is_active: true }]) {
  sinon.stub(jwt, 'verify').returns(user);
  const query = sinon.stub().resolves({ rows });
  const req = { header: () => 'Bearer test', app: { get: () => ({ query }) } };
  const res = { status: sinon.stub().returnsThis(), json: sinon.spy(), error: sinon.spy() };
  const next = sinon.spy();
  await auth(req, res, () => requireAdminAccount(req, res, next));
  return { res, next, query };
}

for (const role of ['qg', 'admin', 'superadmin', 'manager', 'supervisor', 'staff', 'custom-role', undefined]) {
  test(`active admin account can use QG with role ${role}`, async () => {
    const { next, query } = await authorize({ id: 7, type: 'admin', role });
    assert.equal(next.calledOnce, true);
    assert.deepEqual(query.firstCall.args[1], [7]);
  });
}

for (const rows of [[], [{ is_active: false }]]) {
  test(`QG rejects ${rows.length ? 'inactive' : 'deleted'} admin accounts`, async () => {
    const { next, res } = await authorize({ id: 7, type: 'admin', role: 'admin' }, rows);
    assert.equal(next.called, false);
    assert.equal(res.error.firstCall.args[2], 403);
  });
}

test('QG rejects ordinary user tokens even if they claim a QG role', async () => {
  const { next, res } = await authorize({ id: 7, type: 'user', role: 'qg' });
  assert.equal(next.called, false);
  assert.equal(res.status.firstCall.args[0], 403);
});

test('QG requires a signed-in account', async () => {
  const req = { header: () => undefined };
  const res = { error: sinon.spy() };
  const next = sinon.spy();
  await auth(req, res, () => requireAdminAccount(req, res, next));
  assert.equal(next.called, false);
  assert.equal(res.error.firstCall.args[2], 401);
});
