# Standby list bay ordering — TDD evidence

## Source and journey

No source plan was provided. The journey was derived from the request: as a check-in operator, I want standby entries ordered by standard bay name so that the queue is predictable from A bays through E bays.

## Task report

- Added a query-level regression test for standard and fallback bay ordering.
- RED: `node --test test/standbyListSort.test.js` ran the new test and failed because `getStandbyList` had no `ORDER BY` clause.
- GREEN: the same command passed after adding the deterministic ordering clause.
- Regression: `node --test test/*.test.js` passed all 28 tests.
- Syntax: `node --check modules/auth/v1/models/tasksModel.js` passed.
- Added a regression test requiring Standby → Check-In conversion to record `checkin_time`.
- Timestamp RED: the focused test failed because the conversion query updated only `status` and `bay_id`.
- Timestamp GREEN: `node --test test/standbyListSort.test.js` passed both focused tests after adding `CURRENT_TIMESTAMP` to the conversion update.
- Final regression: `node --test test/*.test.js` passed all 29 tests.

## Test specification

| # | What is guaranteed | Test target | Type | Result |
|---|---|---|---|---|
| 1 | Standard `A`–`E` letter-plus-number bays are placed before nonstandard bay names | `test/standbyListSort.test.js` | Query unit test | PASS |
| 2 | Standard bays sort by letter and then numeric suffix | `test/standbyListSort.test.js` | Query unit test | PASS |
| 3 | Nonstandard names have a deterministic alphabetical fallback | `test/standbyListSort.test.js` | Query unit test | PASS |
| 4 | Entries sharing a bay retain FIFO order using creation time and record number | `test/standbyListSort.test.js` | Query unit test | PASS |
| 5 | Converting a Standby record to Check-In records the conversion as `checkin_time` | `test/standbyListSort.test.js` | Query unit test | PASS |

## Coverage and known gaps

`node --experimental-test-coverage --test test/*.test.js` passed 29 tests. Repository-wide line coverage is 17.86% because the legacy model modules are mostly outside the current test suite; both focused changed query paths executed successfully. No live authenticated browser assertion was possible because the available check-in session showed the admin login page.

## Merge evidence

- RED checkpoint: `2c6bd0a test: add reproducer for standby bay ordering`
- GREEN: deterministic SQL ordering plus the passing focused and regression test evidence above.
- Timestamp RED checkpoint: `636092e test: reproduce missing standby check-in time`
- Timestamp GREEN: conversion now records `checkin_time` while preserving the existing status, bay, and parameter behavior.
