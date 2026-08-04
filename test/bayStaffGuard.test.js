const test = require('node:test');
const assert = require('node:assert/strict');

const { hasAssignedBayStaff, canCheckInToBay } = require('../modules/auth/v1/utils/bayStaffGuard');

test('reports an empty bay when no staff are assigned', () => {
  assert.equal(hasAssignedBayStaff([]), false);
  assert.equal(hasAssignedBayStaff(null), false);
});

test('reports a staffed bay when an assigned staff record exists', () => {
  assert.equal(hasAssignedBayStaff([{ staff_id: 42 }]), true);
});

test('allows E1 to check in without assigned staff', () => {
  assert.equal(canCheckInToBay('E1', []), true);
  assert.equal(canCheckInToBay(' e1 ', null), true);
});

test('blocks other bays without assigned staff', () => {
  assert.equal(canCheckInToBay('A1', []), false);
  assert.equal(canCheckInToBay('B1', null), false);
});

test('allows other bays when staff are assigned', () => {
  assert.equal(canCheckInToBay('A2', [{ staff_id: 42 }]), true);
});
