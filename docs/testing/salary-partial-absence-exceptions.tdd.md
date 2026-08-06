# Partial absence deduction TDD evidence

## Source and user journey

No external plan was used. The journey came from the payroll request: when a
staff member has four absent days, an administrator can approve three days and
leave one day deductible, with a mandatory special remark and audit history.

## RED and GREEN

- RED: `node --test test/salaryPartialAbsenceException.test.js` executed five
  new behaviors; four failed because approved days were not calculated,
  validated, or persisted.
- GREEN: `node --test test/*.test.js` passed all 22 backend tests after adding
  backward-compatible partial-day calculation, server-side bounds validation,
  database columns, and audit persistence.
- Coverage: `node --test --experimental-test-coverage
  test/salaryPartialAbsenceException.test.js test/salaryAbsenceException.test.js`
  reported 100% lines, 85.71% branches, and 100% functions for the two payroll
  utility modules.

## Guarantees

| Guarantee | Evidence | Result |
|---|---|---|
| Four absent days with three approved days produces one deductible day | `salaryPartialAbsenceException.test.js` | PASS |
| The deduction percentage uses deductible days, not actual absent days | `salaryPartialAbsenceException.test.js` | PASS |
| Approved days cannot be zero, invalid, or greater than actual absence | Utility test plus model validation contract | PASS |
| Legacy full-waiver records still produce zero deductible days | `salaryAbsenceException.test.js` | PASS |
| Approved days are retained in current and append-only audit records | Model source contract | PASS |

## Security and known gaps

The save and revoke APIs retain authentication, admin/superadmin authorization,
settled-month locking, parameterized SQL, transaction locking, and mandatory
remarks. `npm audit --omit=dev` continues to report pre-existing advisories in
`express-brute`, `underscore`, and `fast-uri`; these dependency issues are not
introduced by this feature.
