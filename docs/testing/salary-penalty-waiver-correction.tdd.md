# Absence penalty waiver correction TDD evidence

## Corrected journey

No external plan was used. The corrected payroll rule is: actual absent days
remain unchanged and continue to determine whether the 10%, 20%, or 25%
penalty is triggered. An approved exception waives the entire monetary penalty;
it does not approve, remove, or partially deduct absent days.

## RED and GREEN

- RED: `node --test test/salaryAbsencePenaltySemantics.test.js` failed 3/3
  because the implementation still accepted approved-day decisions and reduced
  deductible days partially.
- GREEN: the same tests pass after restoring the binary penalty waiver.
- Regression: `node --test test/*.test.js` passes the complete backend suite.

## Guarantees

| Guarantee | Evidence | Result |
|---|---|---|
| Four recorded absent days stay recorded while an active waiver makes the penalty zero | `salaryAbsencePenaltySemantics.test.js` | PASS |
| Partial approved-day input is rejected | `salaryAbsencePenaltySemantics.test.js` | PASS |
| New exception and audit rows store a binary waiver with no approved-day value | Model source contract | PASS |
| Only active binary waivers are loaded and counted as exceptions | `salaryAbsenceExceptionModel.test.js` | PASS |
| Legacy full waivers and revocation behavior remain supported | `salaryAbsenceException.test.js` | PASS |

## Security and compatibility

Authentication, admin/superadmin authorization, mandatory remarks,
settled-month locking, transaction locks, parameterized SQL, and append-only
auditing remain in place. The temporary `approved_absent_days` database columns
are retained as nullable compatibility columns to avoid a destructive schema
change, but new saves always write `NULL` and calculations ignore them.
