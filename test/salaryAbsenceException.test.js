const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getAttendanceAbsenteeism,
  getDeductibleAbsentDays
} = require('../modules/auth/v1/utils/salaryCalculation');
const {
  normalizeAbsenceExceptionInput
} = require('../modules/auth/v1/utils/salaryAbsenceException');

test('uses actual absent days when no active exception exists', () => {
  assert.equal(getDeductibleAbsentDays(3, null), 3);
  assert.equal(getAttendanceAbsenteeism(1000, 3, null), 200);
});

test('waives the full absenteeism deduction for an active exception', () => {
  const exception = { status: 'active', waive_deduction: true };

  assert.equal(getDeductibleAbsentDays(5, exception), 0);
  assert.equal(getAttendanceAbsenteeism(1000, 5, exception), 0);
});

test('does not waive deduction for a revoked exception', () => {
  const exception = { status: 'revoked', waive_deduction: true };

  assert.equal(getDeductibleAbsentDays(2, exception), 2);
  assert.equal(getAttendanceAbsenteeism(1000, 2, exception), 100);
});

test('normalizes a valid exception and trims its special remark', () => {
  assert.deepEqual(
    normalizeAbsenceExceptionInput({
      month: '2026-08',
      staff_no: '42',
      waive_deduction: true,
      special_remark: '  Approved emergency leave  '
    }),
    {
      month: '2026-08',
      staff_no: 42,
      waive_deduction: true,
      special_remark: 'Approved emergency leave'
    }
  );
});

test('rejects an invalid month', () => {
  assert.throws(
    () => normalizeAbsenceExceptionInput({
      month: 'August 2026',
      staff_no: 42,
      waive_deduction: true,
      special_remark: 'Approved emergency leave'
    }),
    /valid month/
  );
});

test('requires a special remark when deduction is waived', () => {
  assert.throws(
    () => normalizeAbsenceExceptionInput({
      month: '2026-08',
      staff_no: 42,
      waive_deduction: true,
      special_remark: '   '
    }),
    /Special Remark is required/
  );
});

test('rejects remarks longer than the payroll audit limit', () => {
  assert.throws(
    () => normalizeAbsenceExceptionInput({
      month: '2026-08',
      staff_no: 42,
      waive_deduction: true,
      special_remark: 'x'.repeat(1001)
    }),
    /1000 characters or fewer/
  );
});
