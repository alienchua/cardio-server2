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

test('monthly salary aggregation selects only active adjustments and active schedule rows', () => {
  const aggregationSource = modelSource.match(
    /const getSalaryAdjustmentsForMonth[\s\S]*?return grouped;/
  )?.[0] || '';

  assert.match(aggregationSource, /WHERE a\.status = 'active'/);
  assert.match(aggregationSource, /sam\.status = 'active'/);
  assert.match(
    aggregationSource,
    /row\.adjustment_type === 'Defect' \|\| row\.adjustment_type === 'Part&Tools'/
  );
});

test('salary totals combine finance input with active monthly adjustment totals', () => {
  assert.match(
    controllerSource,
    /defect_part_tools:\s*asMoney\(finance\.defect_part_tools\) \+ asMoney\(adjustment\.defect_part_tools\)/
  );
});
