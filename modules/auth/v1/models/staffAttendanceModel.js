require('dotenv').config();

const normalizeStaffIdKey = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  if (/^\d+$/.test(raw)) {
    return raw.padStart(3, '0');
  }

  return raw;
};

const resolveStaffNo = async (client, staffId) => {
  const raw = String(staffId ?? '').trim();
  const padded = normalizeStaffIdKey(staffId);

  const result = await client.query(
    `
      SELECT no, staff_id
      FROM staff
      WHERE staff_id::text IN ($1, $2)
         OR no::text = $3
      ORDER BY
        CASE
          WHEN staff_id::text = $1 THEN 1
          WHEN staff_id::text = $2 THEN 2
          WHEN no::text = $3 THEN 3
          ELSE 4
        END
      LIMIT 1
    `,
    [padded, raw, raw]
  );

  return result.rows[0] || null;
};

const upsertAttendance = async (req, rows = []) => {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const pool = req.app.get('pool');
  const attendanceBreakdownColumns = ['late', 'mc', 'hl', 'q', 'al', 'el', 'ul', 'cl'];

  await pool.query(`
    ALTER TABLE staff_attendance
    ADD COLUMN IF NOT EXISTS absent NUMERIC(8,2) DEFAULT 0
  `);

  for (const column of attendanceBreakdownColumns) {
    await pool.query(`
      ALTER TABLE staff_attendance
      ADD COLUMN IF NOT EXISTS ${column} NUMERIC(8,2) DEFAULT 0
    `);
  }

  await pool.query(`
    ALTER TABLE staff_attendance
    ALTER COLUMN attendance TYPE NUMERIC(8,2) USING attendance::numeric,
    ALTER COLUMN absent TYPE NUMERIC(8,2) USING absent::numeric,
    ALTER COLUMN late TYPE NUMERIC(8,2) USING late::numeric,
    ALTER COLUMN mc TYPE NUMERIC(8,2) USING mc::numeric,
    ALTER COLUMN hl TYPE NUMERIC(8,2) USING hl::numeric,
    ALTER COLUMN q TYPE NUMERIC(8,2) USING q::numeric,
    ALTER COLUMN al TYPE NUMERIC(8,2) USING al::numeric,
    ALTER COLUMN el TYPE NUMERIC(8,2) USING el::numeric,
    ALTER COLUMN ul TYPE NUMERIC(8,2) USING ul::numeric,
    ALTER COLUMN cl TYPE NUMERIC(8,2) USING cl::numeric
  `);

  const client = await pool.connect();
  const results = [];

  try {
    await client.query('BEGIN');

    for (const r of rows) {
      const staff = await resolveStaffNo(client, r.staff_id);

      if (!staff) {
        throw new Error(`Staff ID ${r.staff_id} not found`);
      }

      const result = await client.query(
        `
          INSERT INTO staff_attendance (
            staff_id, month_label, attendance, absent, late, mc, hl, q, al, el, ul, cl
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (staff_id, month_label)
          DO UPDATE SET
            attendance = EXCLUDED.attendance,
            absent = EXCLUDED.absent,
            late = EXCLUDED.late,
            mc = EXCLUDED.mc,
            hl = EXCLUDED.hl,
            q = EXCLUDED.q,
            al = EXCLUDED.al,
            el = EXCLUDED.el,
            ul = EXCLUDED.ul,
            cl = EXCLUDED.cl
          RETURNING no, staff_id, month_label, attendance, absent, late, mc, hl, q, al, el, ul, cl
        `,
        [
          staff.no,
          r.month_label,
          r.attendance ?? 0,
          r.absent ?? 0,
          r.late ?? 0,
          r.mc ?? 0,
          r.hl ?? 0,
          r.q ?? 0,
          r.al ?? 0,
          r.el ?? 0,
          r.ul ?? 0,
          r.cl ?? 0
        ]
      );

      results.push({
        ...result.rows[0],
        input_staff_id: r.staff_id,
        matched_staff_id: staff.staff_id
      });
    }

    await client.query('COMMIT');
    return results;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  upsertAttendance
};
