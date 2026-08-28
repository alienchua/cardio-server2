const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('finance salary import requires authentication and payroll access', () => {
  const routes = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'auth', 'v1', 'routes', 'authRoutes.js'),
    'utf8'
  );
  const controller = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'auth', 'v1', 'controllers', 'salaryController.js'),
    'utf8'
  );
  const importController = controller.match(/const importSalaryFinanceInputs[\s\S]*?\n};/)?.[0] || '';

  assert.match(routes, /router\.post\('\/importSalaryFinanceInputs', auth, importSalaryFinanceInputs\)/);
  assert.match(importController, /hasPayrollAccess\(req, res\)/);
});

test('finance import ignores legacy manual attendance absenteeism values', () => {
  const model = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'auth', 'v1', 'models', 'salaryModel.js'),
    'utf8'
  );
  const importer = model.match(/const upsertSalaryFinanceInputs[\s\S]*?\n};/)?.[0] || '';

  assert.doesNotMatch(importer, /money\(input\.attendance_absenteeism\)/);
});
