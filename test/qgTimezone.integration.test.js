const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { instant, installationInstant, malaysiaLocal, malaysiaDate } = require('../modules/auth/v1/models/qgTimestampSql');

// Only temporary fixtures; no application records are changed.
test('QG UTC inspections and Malaysia installations agree at evening and midnight boundaries', {
  skip: process.env.RUN_DB_TESTS !== '1'
}, async (t) => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  t.after(() => db.end());
  await db.query(`CREATE TEMP TABLE qg_time_fixture (
    inspected_at timestamp, checkin_time timestamp,
    expected_date text, expected_hour text, expected_iso text
  );
  INSERT INTO qg_time_fixture VALUES
    ('2026-10-02 10:00:01', '2026-10-02 18:00:01', '2026-10-02', '18:00', '2026-10-02T10:00:01.000Z'),
    ('2026-10-02 15:59:59', '2026-10-02 23:59:59', '2026-10-02', '23:00', '2026-10-02T15:59:59.000Z'),
    ('2026-10-02 16:00:00', '2026-10-03 00:00:00', '2026-10-03', '00:00', '2026-10-02T16:00:00.000Z');`);
  for (const zone of ['UTC', 'Asia/Kuala_Lumpur', 'America/Los_Angeles']) {
    await db.query("SELECT set_config('TimeZone', $1, false)", [zone]);
    const { rows } = await db.query(`SELECT *,
      ${instant('inspected_at')} AS inspection_instant,
      ${installationInstant('checkin_time')} AS installation_instant,
      (${malaysiaDate('inspected_at')})::text AS report_date,
      to_char(${malaysiaLocal('inspected_at')}, 'HH24:00') AS report_hour
      FROM qg_time_fixture ORDER BY inspected_at`);
    for (const row of rows) {
      assert.equal(row.inspection_instant.toISOString(), row.expected_iso, zone);
      assert.equal(row.installation_instant.toISOString(), row.expected_iso, zone);
      assert.equal(row.report_date, row.expected_date, zone);
      assert.equal(row.report_hour, row.expected_hour, zone);
      assert.equal(new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(row.inspection_instant), row.expected_date, zone);
    }
    const counts = await db.query(`SELECT (${malaysiaDate('inspected_at')})::text AS day,
      COUNT(*)::int AS count FROM qg_time_fixture
      GROUP BY 1 ORDER BY 1`);
    assert.deepEqual(counts.rows, [{ day: '2026-10-02', count: 2 }, { day: '2026-10-03', count: 1 }]);
  }
});
