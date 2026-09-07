const test = require('node:test');
const assert = require('node:assert/strict');

const { upsertAttendance } = require('../modules/auth/v1/models/staffAttendanceModel');

test('attendance upload skips unknown staff and commits valid rows', async () => {
  const transactionQueries = [];
  const client = {
    async query(sql, values) {
      const normalizedSql = String(sql).replace(/\s+/g, ' ').trim();
      transactionQueries.push(normalizedSql);

      if (normalizedSql.startsWith('SELECT no, staff_id')) {
        const inputStaffId = values[1];
        if (inputStaffId === '153' || inputStaffId === '241') {
          return { rows: [] };
        }
        return { rows: [{ no: 7, staff_id: '007' }] };
      }

      if (normalizedSql.startsWith('INSERT INTO staff_attendance')) {
        return {
          rows: [{ no: 11, staff_id: values[0], month_label: values[1], attendance: values[2] }]
        };
      }

      return { rows: [] };
    },
    release() {}
  };
  const pool = {
    async query() {
      return { rows: [] };
    },
    async connect() {
      return client;
    }
  };
  const req = { app: { get: () => pool } };

  const result = await upsertAttendance(req, [
    { staff_id: '007', source_row: 2, month_label: '2026-09', attendance: 22 },
    { staff_id: '153', source_row: 3, month_label: '2026-09', attendance: 20 },
    { staff_id: '241', source_row: 4, month_label: '2026-09', attendance: 19 }
  ]);

  assert.equal(result.imported.length, 1);
  assert.deepEqual(result.errors, [
    { row: 3, staff_id: '153', message: 'Staff not found' },
    { row: 4, staff_id: '241', message: 'Staff not found' }
  ]);
  assert.ok(transactionQueries.includes('COMMIT'));
  assert.ok(!transactionQueries.includes('ROLLBACK'));
});
