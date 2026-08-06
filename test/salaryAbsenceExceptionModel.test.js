const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getSalaryAbsenceExceptions
} = require('../modules/auth/v1/models/salaryModel');

test('loads active monthly absence exceptions with staff and attendance context', async () => {
  const expected = [{
    id: 1,
    month: '2026-08',
    staff_no: 42,
    staff_id: '0042',
    staff_name: 'Amin',
    absent: 3,
    waive_deduction: true,
    special_remark: 'Approved emergency leave',
    status: 'active'
  }];
  const schemaClient = {
    query: async () => ({ rows: [] }),
    release: () => {}
  };
  const pool = {
    connect: async () => schemaClient,
    query: async (sql, values) => {
      assert.match(sql, /FROM salary_absence_exceptions sae/);
      assert.match(sql, /sae\.status = 'active'/);
      assert.doesNotMatch(sql, /sae\.waive_deduction = true/);
      assert.deepEqual(values, ['2026-08']);
      return { rows: expected };
    }
  };
  const req = { app: { get: () => pool } };

  const rows = await getSalaryAbsenceExceptions(req, '2026-08');

  assert.deepEqual(rows, expected);
});
