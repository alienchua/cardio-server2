const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  getAttendanceAbsenteeism,
  getDeductibleAbsentDays
} = require('../modules/auth/v1/utils/salaryCalculation');
const {
  normalizeAbsenceExceptionInput
} = require('../modules/auth/v1/utils/salaryAbsenceException');

test('waives the whole penalty without changing actual absent days', () => {
  const exception = {
    status: 'active',
    waive_deduction: true,
    approved_absent_days: 3
  };

  assert.equal(getDeductibleAbsentDays(4, exception), 0);
  assert.equal(getAttendanceAbsenteeism(1000, 4, exception), 0);
});

test('does not accept partial approved-day decisions', () => {
  assert.throws(() => normalizeAbsenceExceptionInput({
    month: '2026-08',
    staff_no: 42,
    waive_deduction: false,
    approved_absent_days: 3,
    special_remark: 'Incorrect partial decision'
  }), /waive_deduction must be true/);
});

test('keeps every normal penalty band when no waiver exists', () => {
  assert.equal(getAttendanceAbsenteeism(1000, 0, null), 0);
  assert.equal(getAttendanceAbsenteeism(1000, 5, null), 250);
});

test('rejects an invalid staff number', () => {
  assert.throws(() => normalizeAbsenceExceptionInput({
    month: '2026-08',
    staff_no: 0,
    waive_deduction: true,
    special_remark: 'Invalid staff'
  }), /valid staff number/);
});

test('exception persistence stores a binary penalty waiver', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'auth', 'v1', 'models', 'salaryModel.js'),
    'utf8'
  );
  const upsert = source.match(/const upsertSalaryAbsenceException[\s\S]*?\n};/)?.[0] || '';

  assert.match(upsert, /VALUES \(\$1, \$2, true/);
  assert.doesNotMatch(upsert, /approvedAbsentDays > actualAbsentDays/);
});
