# Salary finance import TDD evidence

## Scope

- Require authentication and admin or superadmin payroll access.
- Validate salary months using `YYYY-MM`.
- Ignore legacy client-supplied attendance absenteeism values.
- Preserve the existing settled-month guard in the model.

## Red

`node --test test/salaryFinanceImportSecurity.test.js`

The initial tests failed because the route had no authentication middleware,
the controller had no payroll-role check, and the model stored the client value
for `attendance_absenteeism`.

## Green

`node --test test/salaryFinanceImportSecurity.test.js test/salaryAbsenceException.test.js test/salaryAbsenceExceptionModel.test.js`

Result: 10 tests passed.

## Security note

`npm audit --omit=dev` reports existing advisories in `fast-uri`,
`express-brute`, and `underscore`; the latter two currently have no published
fix through the installed dependency chain. These are unrelated to the salary
import change and require a separate dependency review.
