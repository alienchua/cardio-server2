const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const sinon = require('sinon');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const admins = require('../modules/auth/v1/controllers/adminsController');
const { refreshAccessToken } = require('../modules/auth/v1/controllers/authController');
const auth = require('../middlewares/auth');
const model = require('../modules/auth/v1/models/adminsModel');

afterEach(() => sinon.restore());
function context(rows = []) {
  const query = sinon.stub().resolves({ rows });
  const req = { body: {}, user: { id: 1, type: 'admin' }, app: { get: () => ({ query }) }, header: () => 'Bearer test' };
  const res = { status: sinon.stub().returnsThis(), json: sinon.spy(), error: sinon.spy() };
  return { req, res, query, next: sinon.spy() };
}
test('create rejects string status instead of treating false as truthy', async () => {
  const { req, res, query, next } = context();
  req.body = { username: 'test', password: 'password', is_active: 'false' };
  await admins.createAdmin(req, res, next);
  assert.equal(res.status.firstCall.args[0], 400);
  assert.equal(query.called, false);
});
test('status update persists false and accepts PostgreSQL bigint string IDs', async () => {
  const { req, res, query, next } = context([{ id: '2', username: 'test', role: 'admin', is_active: true }]);
  req.body = { id: '2', username: 'test', is_active: false };
  await admins.updateAdminById(req, res, next);
  assert.equal(next.called, false);
  assert.equal(res.status.firstCall.args[0], 200);
  assert.equal(query.lastCall.args[1][5], false);
});
test('omitting status preserves it and creating an account defaults active', async () => {
  const { req, query } = context();
  await model.updateAdmin(req, { id: 2, username: 'test' });
  assert.equal(query.lastCall.args[1][5], null);
  await model.insertAdmin(req, { username: 'test', hashedPassword: 'hash' });
  assert.equal(query.lastCall.args[1][5], true);
});
test('cannot deactivate own account', async () => {
  const { req, res, query, next } = context();
  req.body = { id: '1', username: 'test', is_active: false };
  await admins.updateAdminById(req, res, next);
  assert.equal(res.status.firstCall.args[0], 400);
  assert.equal(query.called, false);
});
test('inactive login never issues tokens', async () => {
  const { req, res, next } = context([{ id: 2, password: 'hash', is_active: false }]);
  req.body = { email: 'test@example.com', password: 'password' };
  sinon.stub(bcrypt, 'compare').resolves(true);
  const sign = sinon.stub(jwt, 'sign');
  await admins.adminLogin(req, res, next);
  assert.equal(res.status.firstCall.args[0], 403);
  assert.equal(sign.called, false);
});
test('existing tokens cannot authorize inactive or deleted admins', async () => {
  sinon.stub(jwt, 'verify').returns({ id: 2, type: 'admin' });
  for (const rows of [[{ is_active: false }], []]) {
    const { req, res, next } = context(rows);
    await auth(req, res, next);
    assert.equal(res.error.firstCall.args[2], 403);
    assert.equal(next.called, false);
  }
});
test('active admin and ordinary user authentication still pass', async () => {
  const verify = sinon.stub(jwt, 'verify');
  for (const type of ['admin', 'user']) {
    verify.returns({ id: 2, type });
    const { req, query, next } = context([{ is_active: true }]);
    await auth(req, {}, next);
    assert.equal(next.calledOnce, true);
    assert.equal(query.called, type === 'admin');
  }
});
test('inactive admin refresh cannot issue a new token', async () => {
  const { req, res, next } = context([{ is_active: false }]);
  req.body = { token: 'test' };
  sinon.stub(jwt, 'verify').returns({ id: 2, type: 'admin' });
  const sign = sinon.stub(jwt, 'sign');
  await refreshAccessToken(req, res, next);
  assert.equal(res.status.firstCall.args[0], 403);
  assert.equal(sign.called, false);
});
