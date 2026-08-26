const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const bikModelSource = fs.readFileSync(
  path.join(__dirname, '..', 'modules', 'auth', 'v1', 'models', 'bikModel.js'),
  'utf8'
);
const bikControllerSource = fs.readFileSync(
  path.join(__dirname, '..', 'modules', 'auth', 'v1', 'controllers', 'bikController.js'),
  'utf8'
);

test('BIK installation dates are returned as timezone-safe YYYY-MM-DD text', () => {
  assert.match(
    bikModelSource,
    /to_char\(b\.installation_date, 'YYYY-MM-DD'\) AS installation_date/
  );
  assert.match(
    bikModelSource,
    /RETURNING no, seq, chassis, to_char\(installation_date, 'YYYY-MM-DD'\) AS installation_date/
  );
  assert.doesNotMatch(
    bikModelSource,
    /SELECT b\.no, b\.seq, b\.chassis, b\.installation_date, b\.bay_id/
  );
  assert.match(
    bikModelSource,
    /b\.installation_date::timestamp AS checkin_time, '-'::text AS cafi_date/
  );
});

test('BIK remarks are stored on BIK records but excluded from salary task rows', () => {
  assert.match(bikModelSource, /ADD COLUMN IF NOT EXISTS remarks TEXT NOT NULL DEFAULT ''/);
  assert.match(bikModelSource, /b\.remarks/);
  assert.match(bikControllerSource, /data\.remarks = String\(input\.remarks \?\? ''\)\.trim\(\)/);

  const salaryRowQuery = bikModelSource.slice(
    bikModelSource.indexOf('const getBikTaskListForStaff'),
    bikModelSource.indexOf('module.exports')
  );
  assert.doesNotMatch(salaryRowQuery, /remarks/);
});
