const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const sinon = require('sinon');
const bcrypt = require('bcryptjs');
const router = require('../modules/auth/v1/routes/authRoutes');
const admins = require('../modules/auth/v1/controllers/adminsController');

afterEach(() => sinon.restore());

function context(actorRole, existingRole = 'installer') {
  const existing = { id: 2, username: 'worker', role: existingRole, is_active: true };
  const query = sinon.stub().callsFake(async (sql, values) => {
    if (sql.includes('WHERE id = $1')) return { rows: [existing] };
    if (sql.startsWith('UPDATE') || sql.startsWith('INSERT')) return { rows: [{ ...existing, role: 'qg' }] };
    return { rows: [] };
  });
  return {
    req: { user: { id: 1, type: 'admin', role: actorRole }, body: { id: 2, username: 'worker', role: 'qg' }, app: { get: () => ({ query }) } },
    res: { status: sinon.stub().returnsThis(), json: sinon.spy() },
    next: sinon.spy(), query
  };
}

for (const path of ['/createAdmin', '/updateAdmin', '/getAdminWithId/:id', '/getAddAdmin']) {
  test(`${path} allows all three managers and rejects other roles`, () => {
    const route = router.stack.find(layer => layer.route?.path === path).route;
    const guard = route.stack[1].handle;
    for (const role of ['admin', 'supervisor', 'superadmin', 'qg', 'installer', 'manager', undefined]) {
      const { req, res, next } = context(role);
      guard(req, res, next);
      assert.equal(next.calledOnce, ['admin', 'supervisor', 'superadmin'].includes(role), role);
      if (!next.called) assert.equal(res.status.firstCall.args[0], 403);
    }
  });
}

for (const role of ['admin', 'supervisor', 'superadmin']) {
  test(`${role} can create a QG account`, async () => {
    const { req, res, next, query } = context(role);
    req.body.password = 'test-password';
    sinon.stub(bcrypt, 'hash').resolves('test-hash');
    await admins.createAdmin(req, res, next);
    assert.equal(next.called, false);
    assert.equal(res.status.firstCall.args[0], 201);
    assert.equal(query.lastCall.args[1][4], 'qg');
  });
  test(`${role} can assign QG to an existing ordinary account`, async () => {
    const { req, res, next, query } = context(role);
    await admins.updateAdminById(req, res, next);
    assert.equal(next.called, false);
    assert.equal(res.status.firstCall.args[0], 200);
    assert.equal(query.lastCall.args[1][3], 'qg');
  });
}

test('supervisor can edit an existing QG account', async () => {
  const { req, res, next } = context('supervisor', 'qg');
  req.body.is_active = false;
  await admins.updateAdminById(req, res, next);
  assert.equal(res.status.firstCall.args[0], 200);
});

for (const targetRole of ['admin', 'superadmin', 'supervisor']) {
  test(`supervisor cannot modify a ${targetRole} account`, async () => {
    const { req, res, next, query } = context('supervisor', targetRole);
    await admins.updateAdminById(req, res, next);
    assert.equal(res.status.firstCall.args[0], 403);
    assert.equal(query.callCount, 1);
  });
}

for (const targetRole of ['admin', 'superadmin', 'supervisor', 'installer', undefined]) {
  test(`supervisor cannot create or promote QG to ${targetRole}`, async () => {
    for (const action of ['createAdmin', 'updateAdminById']) {
      const { req, res, next, query } = context('supervisor', 'installer');
      req.body.role = targetRole;
      if (action === 'createAdmin') req.body.password = 'test-password';
      await admins[action](req, res, next);
      assert.equal(res.status.firstCall.args[0], 403);
      assert.equal(query.getCalls().some(call => /^(UPDATE|INSERT)/.test(call.args[0])), false);
    }
  });
}

test('assigning QG does not grant Admin or Supervisor password reset access', async () => {
  for (const role of ['admin', 'supervisor']) {
    const { req, res, next, query } = context(role, 'qg');
    req.body.password = 'new-password';
    await admins.updateAdminById(req, res, next);
    assert.equal(res.status.firstCall.args[0], 403);
    assert.equal(query.called, false);
  }
});
