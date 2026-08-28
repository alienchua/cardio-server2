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

test('BIK installation and plan dates are returned as timezone-safe YYYY-MM-DD text', () => {
  assert.match(
    bikModelSource,
    /to_char\(b\.installation_date, 'YYYY-MM-DD'\) AS installation_date/
  );
  assert.match(
    bikModelSource,
    /RETURNING no, seq, chassis, to_char\(installation_date, 'YYYY-MM-DD'\) AS installation_date/
  );
  assert.match(
    bikModelSource,
    /to_char\(b\.plan_date, 'YYYY-MM-DD'\) AS plan_date/
  );
  assert.doesNotMatch(
    bikModelSource,
    /SELECT b\.no, b\.seq, b\.chassis, b\.installation_date, b\.bay_id/
  );
  assert.match(
    bikModelSource,
    /b\.installation_date::timestamp AS checkin_time,\s+to_char\(b\.plan_date, 'YYYY-MM-DD'\) AS cafi_date/
  );
});

test('BIK plan dates are required and existing BIK rows are backfilled', () => {
  assert.match(bikModelSource, /ADD COLUMN IF NOT EXISTS plan_date DATE/);
  assert.match(bikModelSource, /UPDATE bik_task SET plan_date = installation_date WHERE plan_date IS NULL/);
  assert.match(bikControllerSource, /'plan_date'/);
  assert.match(bikControllerSource, /plan date must use YYYY-MM-DD/);
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

test('BIK permits an empty installer list and zero price only in Bay E', () => {
  assert.match(bikModelSource, /price_cents BIGINT NOT NULL CONSTRAINT bik_task_price_cents_nonnegative CHECK \(price_cents >= 0\)/);
  assert.match(bikModelSource, /bik_task_price_cents_nonnegative CHECK \(price_cents >= 0\)/);
  assert.match(bikControllerSource, /const isBayE = .*startsWith\('E'\)/);
  assert.match(bikControllerSource, /at least one installer is required outside Bay E/);
  assert.match(bikControllerSource, /price can only be zero in Bay E/);
});
