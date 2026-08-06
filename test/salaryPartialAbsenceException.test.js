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

test('deducts only unapproved absent days', () => {
  const exception = {
    status: 'active',
    waive_deduction: false,
    approved_absent_days: 3
  };

  assert.equal(getDeductibleAbsentDays(4, exception), 1);
  assert.equal(getAttendanceAbsenteeism(1000, 4, exception), 100);
});

test('clamps approved days to actual absence', () => {
  const exception = {
    status: 'active',
    waive_deduction: true,
    approved_absent_days: 5
  };

  assert.equal(getDeductibleAbsentDays(2, exception), 0);
});

test('keeps the normal deduction when an active record approves no days', () => {
  const exception = {
    status: 'active',
    waive_deduction: false,
    approved_absent_days: null
  };

  assert.equal(getDeductibleAbsentDays(2, exception), 2);
});

test('normalizes approved absent days for an audited exception', () => {
  assert.deepEqual(normalizeAbsenceExceptionInput({
    month: '2026-08',
    staff_no: '42',
    waive_deduction: false,
    approved_absent_days: '3',
    special_remark: '  Three days approved by management  '
  }), {
    month: '2026-08',
    staff_no: 42,
    approved_absent_days: 3,
    special_remark: 'Three days approved by management'
  });
});

test('rejects zero or invalid approved absent days', () => {
  for (const approvedAbsentDays of [0, -1, 'invalid']) {
    assert.throws(() => normalizeAbsenceExceptionInput({
      month: '2026-08',
      staff_no: 42,
      approved_absent_days: approvedAbsentDays,
      special_remark: 'Approved by management'
    }), /Approved absent days/);
  }
});

test('rejects invalid staff numbers and empty legacy waiver decisions', () => {
  assert.throws(() => normalizeAbsenceExceptionInput({
    month: '2026-08',
    staff_no: 0,
    approved_absent_days: 1,
    special_remark: 'Approved by management'
  }), /valid staff number/);

  assert.throws(() => normalizeAbsenceExceptionInput({
    month: '2026-08',
    staff_no: 42,
    waive_deduction: false,
    special_remark: 'Approved by management'
  }), /waive_deduction must be true/);
});

test('persists approved days in exception and audit records', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'auth', 'v1', 'models', 'salaryModel.js'),
    'utf8'
  );

  assert.match(source, /salary_absence_exceptions[\s\S]*approved_absent_days/);
  assert.match(source, /salary_absence_exception_audit[\s\S]*approved_absent_days/);
  assert.match(source, /approved absent days cannot exceed actual absent days/i);
});
