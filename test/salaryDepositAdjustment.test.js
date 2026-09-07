const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const modelSource = fs.readFileSync(
  path.join(__dirname, '..', 'modules', 'auth', 'v1', 'models', 'salaryModel.js'),
  'utf8'
);
const controllerSource = fs.readFileSync(
  path.join(__dirname, '..', 'modules', 'auth', 'v1', 'controllers', 'salaryController.js'),
  'utf8'
);
const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('Deposit is accepted and grouped as a salary deposit deduction', () => {
  assert.match(modelSource, /ADJUSTMENT_TYPES\s*=\s*\[[^\]]*'Deposit'/);
  assert.match(modelSource, /deposit:\s*0/);
  assert.match(
    modelSource,
    /row\.adjustment_type === 'Deposit'\) grouped\[staffId\]\.deposit \+= absAmount/
  );
  assert.match(
    controllerSource,
    /deposit:\s*asMoney\(finance\.deposit\) \+ asMoney\(adjustment\.deposit\)/
  );
});

test('Express error handler is registered after application routes', () => {
  const authRoutesIndex = serverSource.indexOf("app.use('/auth', authRoutes)");
  const errorHandlerIndex = serverSource.indexOf('app.use(errorHandler)');

  assert.ok(authRoutesIndex >= 0);
  assert.ok(errorHandlerIndex > authRoutesIndex);
});
