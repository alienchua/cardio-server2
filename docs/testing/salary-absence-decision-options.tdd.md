# Salary absence penalty decisions

## Behavior

- A payroll reviewer must submit an explicit `waive_deduction` boolean.
- `true` waives the monetary absence penalty; `false` keeps the normal penalty.
- Both values are active, reviewed decisions and are returned by the monthly reader.
- `special_remark` is optional, trimmed, and limited to 1,000 characters.
- Actual absent days are never changed by this decision.

## Safety retained

- Only staff with recorded absent days can receive a decision.
- Settled months remain locked.
- Every save is written to the audit table with the chosen boolean and acting user.
- Existing route authentication and payroll authorization remain unchanged.

## Verification

- RED: decision tests failed while the API required `true`, required a remark, and filtered out `false` rows.
- GREEN: the complete backend suite passes with both choices and optional remarks.
