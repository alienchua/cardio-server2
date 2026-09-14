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

const { upsertSalaryAbsenceException, revokeSalaryAbsenceException } = require('../modules/auth/v1/models/salaryModel');

for (const waive of [true, false]) {
  test(`saves decision ${waive} and its audit record in one transaction`, async () => {
    const calls = [];
    const row = { id: 7, staff_no: 42, waive_deduction: waive };
    const client = {
      async query(sql, values) {
        calls.push({ sql, values });
        if (sql.includes('FROM settlement_month')) return { rowCount: 0, rows: [] };
        if (sql.includes('FROM staff s')) return { rowCount: 1, rows: [{ no: 42, absent: 3 }] };
        if (sql.includes('INSERT INTO salary_absence_exceptions (')) return { rowCount: 1, rows: [row] };
        return { rowCount: 0, rows: [] };
      },
      release() {}
    };
    const req = { app: { get: () => ({ connect: async () => client }) } };
    const result = await upsertSalaryAbsenceException(req, { month: '2026-09', staff_no: 42, waive_deduction: waive, special_remark: 'Reviewed' }, 9);
    assert.deepEqual(result, row);
    assert.deepEqual(calls.find(c => c.sql.includes('INSERT INTO salary_absence_exceptions (')).values, ['2026-09', 42, waive, 'Reviewed', 9]);
    assert.ok(calls.some(c => c.sql.includes('INSERT INTO salary_absence_exception_audit (')));
    assert.equal(calls.at(-1).sql, 'COMMIT');
    assert.ok(!calls.some(c => /UPDATE staff_attendance/.test(c.sql)));
  });
}

for (const operation of [upsertSalaryAbsenceException, revokeSalaryAbsenceException]) {
  test(`${operation.name} rejects settled months and rolls back`, async () => {
    const calls = [];
    const client = {
      async query(sql) {
        calls.push(sql);
        return { rowCount: sql.includes('FROM settlement_month') ? 1 : 0, rows: [] };
      },
      release() {}
    };
    const req = { app: { get: () => ({ connect: async () => client }) } };
    await assert.rejects(operation(req, { month: '2026-09', staff_no: 42, waive_deduction: true }), /settled/);
    assert.equal(calls.at(-1), 'ROLLBACK');
    assert.ok(!calls.some(sql => /INSERT INTO salary_absence_exceptions|UPDATE salary_absence_exceptions/.test(sql)));
  });
}
