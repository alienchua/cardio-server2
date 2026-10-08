const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { malaysiaDate, malaysiaTimestamp, malaysiaInstant, databaseTypes } = require('../utils/malaysiaTime');

test('Malaysia operational defaults do not use the host calendar day', () => {
  const now = new Date('2026-10-02T16:30:00.123Z');
  assert.equal(malaysiaDate(now), '2026-10-03');
  assert.equal(malaysiaTimestamp(now), '2026-10-03T00:30:00.123+08:00');
  assert.equal(malaysiaInstant('2026-10-02 18:30:00').toISOString(), '2026-10-02T10:30:00.000Z');
});

test('database wire values preserve Malaysia wall times, calendar dates, and UTC instants', {
  skip: process.env.RUN_DB_TESTS !== '1'
}, async t => {
  const db = new Client({ connectionString: process.env.DATABASE_URL, types: databaseTypes, options: '-c timezone=UTC' });
  await db.connect();
  t.after(() => db.end());
  await db.query('CREATE TEMP TABLE myt_fixture (checkin_time timestamp, cafi_date date)');
  await db.query('INSERT INTO myt_fixture VALUES ($1, $2)', [malaysiaTimestamp(new Date('2026-10-02T10:30:00Z')), '2026-10-02']);
  const { rows: [row] } = await db.query("SELECT *, checkin_time AT TIME ZONE 'Asia/Kuala_Lumpur' AS instant FROM myt_fixture");
  assert.equal(row.checkin_time, '2026-10-02 18:30:00');
  assert.equal(row.cafi_date, '2026-10-02');
  assert.equal(row.instant.toISOString(), '2026-10-02T10:30:00.000Z');
});
