# Salary Date Range Detail TDD Evidence

## Source and user journey

No plan file was supplied. The journey was derived from the reported salary voucher screenshot:

> As a payroll administrator, I want salary detail searches by date range to return task data or an empty JSON result, so that selecting Date Range does not show an HTML API error.

## RED evidence

Command:

```text
node --test test/salaryDateRange.test.js
```

Before the implementation, 1 test passed and 2 failed:

- The range query referenced PostgreSQL parameters `$2`, `$3`, and `$4` while supplying four values, leaving `$1` unused.
- `errorHandler` was registered before the `/auth` and `/realtime` routes.

## GREEN evidence

The same targeted command passed all 3 tests after the implementation. The complete backend test set was then run with:

```text
node --test (Get-ChildItem test -Filter *.test.js | ForEach-Object { $_.FullName })
```

Result: 32 tests passed, 0 failed, 0 skipped.

Syntax validation:

```text
node --check server.js
node --check modules/auth/v1/models/tasksModel.js
```

Result: both checks passed.

## Test specification

| # | What is guaranteed | Test target | Type | Result |
|---|---|---|---|---|
| 1 | A salary task date-range query uses dense PostgreSQL placeholders and values `[staffId, dateFrom, dateTo]` | `test/salaryDateRange.test.js` | Integration-style model test | PASS |
| 2 | The existing monthly query retains its month and staff parameters | `test/salaryDateRange.test.js` | Regression test | PASS |
| 3 | API errors pass through the JSON error middleware after the application routes | `test/salaryDateRange.test.js` | Server configuration test | PASS |

## Coverage and known gaps

The repository has no configured coverage command or threshold, so a numerical coverage result is unavailable. The regression directly executes both branches of `getStaffTaskList` parameter construction and verifies server middleware ordering. It does not connect to a live PostgreSQL database or exercise the browser UI.

Monthly payroll fields remain month-scoped. This change does not introduce an unapproved rule for prorating attendance, finance inputs, installments, or absence deductions across arbitrary date ranges.
