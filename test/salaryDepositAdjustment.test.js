const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (relativePath) => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
const model = read('modules/auth/v1/models/salaryModel.js');
const controller = read('modules/auth/v1/controllers/salaryController.js');

test('server accepts and aggregates Deposit adjustments as positive deductions', () => {
  const adjustmentTypes = model.match(/const ADJUSTMENT_TYPES\s*=\s*\[[^\]]+\]/)?.[0] || '';
  const monthlyAggregation = model.match(/const getSalaryAdjustmentsForMonth[\s\S]*?return grouped;\r?\n\};/)?.[0] || '';

  assert.match(adjustmentTypes, /'Deposit'/);
  assert.match(monthlyAggregation, /deposit:\s*0/);
  assert.match(
    monthlyAggregation,
    /row\.adjustment_type\s*===\s*'Deposit'[\s\S]*?grouped\[staffId\]\.deposit\s*\+=\s*absAmount/
  );
});

test('Deposit adjustments combine with finance deposits before salary totals are calculated', () => {
  const combine = controller.match(/const combineFinanceAndAdjustments[\s\S]*?\n\}\);/)?.[0] || '';
  const totalsBuilder = controller.match(/const buildSalaryTotals[\s\S]*?\n\};/)?.[0] || '';

  assert.match(
    combine,
    /deposit:\s*asMoney\(finance\.deposit\)\s*\+\s*asMoney\(adjustment\.deposit\)/
  );
  assert.match(totalsBuilder, /asMoney\(effectiveFinance\.deposit\)/);
  assert.match(totalsBuilder, /deposit:\s*asMoney\(effectiveFinance\.deposit\)/);
});
