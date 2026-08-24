# Standby list bay ordering — TDD evidence

## Source and journey

No source plan was provided. The journey was derived from the request: as a check-in operator, I want standby entries ordered by standard bay name so that the queue is predictable from A bays through E bays.

## Task report

- Added a query-level regression test for standard and fallback bay ordering.
- RED: `node --test test/standbyListSort.test.js` ran the new test and failed because `getStandbyList` had no `ORDER BY` clause.
- GREEN: the same command passed after adding the deterministic ordering clause.
- Regression: `node --test test/*.test.js` passed all 28 tests.
- Syntax: `node --check modules/auth/v1/models/tasksModel.js` passed.
- Corrected the Standby → Check-In regression test to require `checkin_time` to remain unset until staff pickup.
- Pickup-time RED: the focused test failed because the conversion query still assigned `CURRENT_TIMESTAMP`.
- Pickup-time GREEN: `node --test test/standbyListSort.test.js` passed both focused tests after removing the conversion-time timestamp assignment.
- Added a complementary query test confirming that staff pickup records the actual `checkin_time`.
- Pickup timestamp RED: the focused test failed because staff pickup still supplied a JavaScript `Date` parameter.
- Pickup timestamp GREEN: staff pickup now assigns database `CURRENT_TIMESTAMP`, keeping timestamp creation in the configured database timezone.
- Final regression: `node --test test/*.test.js` passed all 33 tests.

## Test specification

| # | What is guaranteed | Test target | Type | Result |
|---|---|---|---|---|
| 1 | Standard `A`–`E` letter-plus-number bays are placed before nonstandard bay names | `test/standbyListSort.test.js` | Query unit test | PASS |
| 2 | Standard bays sort by letter and then numeric suffix | `test/standbyListSort.test.js` | Query unit test | PASS |
| 3 | Nonstandard names have a deterministic alphabetical fallback | `test/standbyListSort.test.js` | Query unit test | PASS |
| 4 | Entries sharing a bay retain FIFO order using creation time and record number | `test/standbyListSort.test.js` | Query unit test | PASS |
| 5 | Converting a Standby record to Check-In leaves `checkin_time` unset for staff pickup | `test/standbyListSort.test.js` | Query unit test | PASS |
| 6 | Staff pickup records `checkin_time` using database `CURRENT_TIMESTAMP` | `test/standbyListSort.test.js` | Query unit test | PASS |

## Coverage and known gaps

`node --experimental-test-coverage --test test/*.test.js` passed 33 tests. Repository-wide line coverage is 20.42% because the legacy model modules are mostly outside the current test suite; both focused changed query paths executed successfully. No live authenticated browser assertion was performed for this query-level change.

## Merge evidence

- RED checkpoint: `2c6bd0a test: add reproducer for standby bay ordering`
- GREEN: deterministic SQL ordering plus the passing focused and regression test evidence above.
- The earlier timestamp checkpoint is superseded by the corrected business rule.
- Pickup-time RED: the conversion query was proven to assign `checkin_time` too early.
- Pickup-time GREEN: conversion now preserves a null `checkin_time` while updating status and bay; staff pickup remains responsible for recording the start time.
