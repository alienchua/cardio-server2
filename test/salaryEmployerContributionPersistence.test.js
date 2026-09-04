const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'modules', 'auth', 'v1', 'models', 'salaryModel.js'),
  'utf8'
);

test('salary finance schema persists employer SOCSO and SIP/EIS contributions', () => {
  const ensureTables = source.match(/const ensureSalaryFinanceTables[\s\S]*?const monthIndex/)?.[0] || '';

  assert.match(ensureTables, /socso_employer NUMERIC\(12,2\) DEFAULT 0/);
  assert.match(ensureTables, /sip_employer NUMERIC\(12,2\) DEFAULT 0/);
  assert.match(ensureTables, /ADD COLUMN IF NOT EXISTS socso_employer/);
  assert.match(ensureTables, /ADD COLUMN IF NOT EXISTS sip_employer/);
});

test('salary finance upsert inserts and updates both employer contributions', () => {
  const upsert = source.match(/const upsertSalaryFinanceInputs[\s\S]*?const insertSettlement/)?.[0] || '';

  assert.match(upsert, /money\(input\.socso_employer\)/);
  assert.match(upsert, /money\(input\.sip_employer\)/);
  assert.match(upsert, /socso, socso_employer, sip, sip_employer, pcb/);
  assert.match(upsert, /socso_employer = EXCLUDED\.socso_employer/);
  assert.match(upsert, /sip_employer = EXCLUDED\.sip_employer/);
});
