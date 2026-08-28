const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'modules', 'auth', 'v1', 'models', 'tasksModel.js'),
  'utf8'
);

test('master detail accessory query returns full accessory metadata', () => {
  const queryBlock = source.match(/const getItemByMasterNo[\s\S]*?return result\.rows\s*\n};/)?.[0] || '';

  assert.match(queryBlock, /LEFT JOIN accessories/);
  assert.match(queryBlock, /full_name/);
  assert.match(queryBlock, /accessory_type/);
  assert.match(queryBlock, /accessory_code/);
  assert.match(queryBlock, /accessories_id AS accessory_id/);
  assert.match(queryBlock, /task_type/);
});

test('master detail check-in query returns each assigned staff member’s staff_id', () => {
  const queryBlock = source.match(/const getCheckInByMasterNo2[\s\S]*?return result\.rows\s*\n};/)?.[0] || '';

  assert.match(queryBlock, /'staff_id', s\.staff_id/);
});
