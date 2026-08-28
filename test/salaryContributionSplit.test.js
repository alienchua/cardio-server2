const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (relativePath) => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
const model = read('modules/auth/v1/models/salaryModel.js');
const controller = read('modules/auth/v1/controllers/salaryController.js');

test('finance storage persists employer SOCSO and SIP/EIS separately', () => {
  const schema = model.match(/CREATE TABLE IF NOT EXISTS salary_finance_inputs[\s\S]*?\n    `\);/)?.[0] || '';
  const importer = model.match(/const upsertSalaryFinanceInputs[\s\S]*?\n};/)?.[0] || '';

  assert.match(schema, /socso_employer NUMERIC\(12,2\)/);
  assert.match(schema, /sip_employer NUMERIC\(12,2\)/);
  assert.match(model, /ALTER TABLE salary_finance_inputs[\s\S]*?ADD COLUMN IF NOT EXISTS socso_employer/);
  assert.match(model, /ALTER TABLE salary_finance_inputs[\s\S]*?ADD COLUMN IF NOT EXISTS sip_employer/);
  assert.match(importer, /money\(input\.socso_employer\)/);
  assert.match(importer, /money\(input\.sip_employer\)/);
  assert.match(importer, /SIP\/EIS employee and employer amounts must match/);
});

test('only employee SOCSO and SIP/EIS are deducted from the final payment', () => {
  const totals = controller.match(/const buildSalaryTotals[\s\S]*?\n};/)?.[0] || '';

  assert.match(totals, /const socsoEmployee = asMoney\(effectiveFinance\.socso\)/);
  assert.match(totals, /const socsoEmployer = asMoney\(effectiveFinance\.socso_employer\)/);
  assert.match(totals, /const sipEmployee = asMoney\(effectiveFinance\.sip\)/);
  assert.match(totals, /const sipEmployer = asMoney\(effectiveFinance\.sip_employer/);
  assert.match(totals, /socsoEmployee \+\s*\n\s*sipEmployee/);
  assert.doesNotMatch(totals.match(/const finalPaymentDeduction[\s\S]*?;\n/)?.[0] || '', /socsoEmployer|sipEmployer/);
  assert.match(totals, /socso_employee:\s*socsoEmployee/);
  assert.match(totals, /socso_employer:\s*socsoEmployer/);
  assert.match(totals, /sip_employee:\s*sipEmployee/);
  assert.match(totals, /sip_employer:\s*sipEmployer/);
});
