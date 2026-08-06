# Salary absence exceptions — TDD evidence

## Source

Journeys and acceptance criteria were derived from the client request in the Codex task. No external plan file was used.

## User journeys

- As a payroll administrator, I can waive the monthly absenteeism deduction for a staff member with absent days and record a mandatory Special Remark.
- As a payroll administrator, I can revoke an open-month waiver and restore the normal deduction.
- As a payroll reviewer, I can see the waiver, its financial effect, and its remark in Salary List and the printed voucher.
- As a payroll operator, I cannot change a waiver after settlement, and settlement preserves the decision in its snapshot.

## RED/GREEN evidence

- RED: `node --test test/salaryAbsenceException.test.js` failed with `MODULE_NOT_FOUND` for the not-yet-created calculation module.
- GREEN: the same focused test passed 7/7 after calculation and validation were implemented.
- RED: `node --test test/salaryAbsenceExceptionModel.test.js` failed because `getSalaryAbsenceExceptions` did not exist.
- GREEN: the model contract passed after active monthly exception persistence was implemented.
- Full backend run: `node --test test/*.test.js` passed 13/13.
- Frontend verification: `npm.cmd run build` completed successfully with 1,651 modules transformed.

## Test specification

| # | Guarantee | Evidence | Type | Result |
|---|---|---|---|---|
| 1 | Normal absent days retain the 10%/20%/25% deduction bands | `test/salaryAbsenceException.test.js` | Unit | PASS |
| 2 | An active full waiver makes deductible absent days and the deduction zero | `test/salaryAbsenceException.test.js` | Unit | PASS |
| 3 | A revoked waiver restores the normal deduction | `test/salaryAbsenceException.test.js` | Unit | PASS |
| 4 | Month, staff number, mandatory remark, and remark length are validated | `test/salaryAbsenceException.test.js` | Unit | PASS |
| 5 | Active exception reads include staff and attendance context | `test/salaryAbsenceExceptionModel.test.js` | Model contract | PASS |
| 6 | Frontend exception tab and voucher code compile into a production bundle | `npm.cmd run build` | Build integration | PASS |

## Coverage and known gaps

`node --test --experimental-test-coverage test/*.test.js` reported:

- `salaryCalculation.js`: 100% lines, 100% functions, 78.95% branches.
- `salaryAbsenceException.js`: 90% lines, 100% functions, 66.67% branches.
- The complete `salaryModel.js` reports low global coverage because the legacy model is a large multi-feature file and most of it is outside this feature.
- The frontend repository does not include a project TypeScript compiler or application test harness. Production Vite build is the available frontend gate.
- A live PostgreSQL integration test and browser E2E test remain deployment-environment follow-ups.

## Checkpoints

- `67fed33` — RED calculation/validation reproducer.
- `6e55bac` — GREEN calculation/validation implementation.
- `4f8056a` — RED persistence contract.
- `b102ac0` — GREEN persistence, API, and settlement implementation.
