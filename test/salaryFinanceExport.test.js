const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (relativePath) => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('monthly finance export is authenticated and checks payroll access', () => {
  const routes = read('modules/auth/v1/routes/authRoutes.js');
  const controller = read('modules/auth/v1/controllers/salaryController.js');
  const exportController = controller.match(/const getSalaryFinanceExport[\s\S]*?\n};/)?.[0] || '';

  assert.match(routes, /router\.post\('\/getSalaryFinanceExport', auth, getSalaryFinanceExport\)/);
  assert.match(exportController, /hasPayrollAccess\(req, res\)/);
  assert.match(exportController, /getFinanceInputsForMonth/);
  assert.match(exportController, /getSalaryResult/);
  assert.match(exportController, /const snapshotTotals = buildSalaryTotals/);
  assert.match(exportController, /\.\.\.snapshotTotals\.totals/);
});

test('monthly finance inputs are fetched in one query instead of one query per staff', () => {
  const model = read('modules/auth/v1/models/salaryModel.js');
  const batchReader = model.match(/const getFinanceInputsForMonth[\s\S]*?\n};/)?.[0] || '';

  assert.match(batchReader, /WHERE month = \$1/);
  assert.doesNotMatch(batchReader, /staff_no = \$2/);
});
