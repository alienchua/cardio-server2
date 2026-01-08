require('dotenv').config();

const upsertAttendance = async (req, rows = []) => {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const pool = req.app.get('pool');

  const statements = rows.map((r) =>
    pool.query(
      `
        INSERT INTO staff_attendance (staff_id, month_label, attendance)
        VALUES ($1, $2, $3)
        ON CONFLICT (staff_id, month_label)
        DO UPDATE SET attendance = EXCLUDED.attendance
        RETURNING no, staff_id, month_label, attendance
      `,
      [r.staff_id, r.month_label, r.attendance || 0]
    )
  );

  const results = await Promise.all(statements);
  return results.flatMap((r) => r.rows);
};

module.exports = {
  upsertAttendance
};
