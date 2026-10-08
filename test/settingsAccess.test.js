const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const sinon = require('sinon');
const jwt = require('jsonwebtoken');
const router = require('../modules/auth/v1/routes/authRoutes');
const auth = require('../middlewares/auth');

afterEach(() => sinon.restore());

const routes = [
  ['get', '/settings/special-car', ['admin', 'superadmin']],
  ['get', '/settings/special-car/models', ['admin', 'superadmin']],
  ['post', '/settings/special-car', ['admin', 'superadmin']],
  ['post', '/qg/defect-options/:category', ['admin', 'supervisor', 'superadmin']],
  ['get', '/qg/defect-options', ['admin', 'supervisor', 'superadmin', 'manager', 'qg']]
];

for (const [method, path, allowed] of routes) {
  const route = router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route;
  test(`${method} ${path} requires authentication`, async () => {
    assert.equal(route.stack[0].handle, auth);
    const res = { error: sinon.spy() };
    const next = sinon.spy();
    await route.stack[0].handle({ header: () => undefined }, res, next);
    assert.equal(next.called, false);
    assert.equal(res.error.firstCall.args[2], 401);
  });
  for (const role of ['admin', 'superadmin', 'supervisor', 'manager', 'qg']) {
    test(`${method} ${path}: ${role} is ${allowed.includes(role) ? 'allowed' : 'denied'}`, async () => {
      sinon.stub(jwt, 'verify').returns({ id: 1, type: 'admin', role });
      const req = {
        header: () => 'Bearer test',
        app: { get: () => ({ query: async () => ({ rows: [{ is_active: true }] }) }) }
      };
      const res = { status: sinon.stub().returnsThis(), json: sinon.spy(), error: sinon.spy() };
      const next = sinon.spy();
      await route.stack[0].handle(req, res, () => route.stack[1].handle(req, res, next));
      assert.equal(next.calledOnce, allowed.includes(role));
      if (!allowed.includes(role)) assert.equal(res.status.firstCall.args[0], 403);
    });
  }
}
