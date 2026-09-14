const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { normalizeAbsenceExceptionInput } = require('../modules/auth/v1/utils/salaryAbsenceException');
const { getAttendanceAbsenteeism } = require('../modules/auth/v1/utils/salaryCalculation');

test('accepts waive and do-not-waive decisions with an optional remark', () => {
  assert.deepEqual(normalizeAbsenceExceptionInput({
    month: '2026-08',
    staff_no: 42,
    waive_deduction: true
  }), {
    month: '2026-08',
    staff_no: 42,
    waive_deduction: true,
    special_remark: ''
  });

  assert.deepEqual(normalizeAbsenceExceptionInput({
    month: '2026-08',
    staff_no: 42,
    waive_deduction: false,
    special_remark: '  Normal penalty confirmed  '
  }), {
    month: '2026-08',
    staff_no: 42,
    waive_deduction: false,
    special_remark: 'Normal penalty confirmed'
  });
});

test('requires an explicit boolean penalty decision', () => {
  assert.throws(() => normalizeAbsenceExceptionInput({
    month: '2026-08',
    staff_no: 42
  }), /waive_deduction must be true or false/);
});

test('a do-not-waive decision keeps the normal penalty', () => {
  assert.equal(getAttendanceAbsenteeism(1000, 4, {
    status: 'active',
    waive_deduction: false
  }), 200);
});

test('persistence stores both active decision values and reads both', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'auth', 'v1', 'models', 'salaryModel.js'),
    'utf8'
  );
  const upsert = source.match(/const upsertSalaryAbsenceException[\s\S]*?\n};/)?.[0] || '';
  const reader = source.match(/const getSalaryAbsenceExceptions[\s\S]*?\n};/)?.[0] || '';

  assert.match(upsert, /item\.waive_deduction/);
  assert.doesNotMatch(upsert, /VALUES \(\$1, \$2, true/);
  assert.doesNotMatch(reader, /sae\.waive_deduction = true/);
});
