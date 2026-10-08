# QG database rollout

Run:

```bash
npm run migrate:qg
```

The migration is additive and can be run more than once. Run it before deploying the updated QG and Admin apps.
It also ensures the `admins.is_active` column required by QG authentication exists.
It seeds Functional, Installation, Handling, Part/Mfg, and Spec when they do not exist, and adds the 35 defect descriptions and the initial area `None`. Admin users can edit all three dropdown lists in Settings. Rerunning the migration preserves those edits. Removed options remain in the database for historical inspections, and new inspections also save the selected names as snapshots.

QG jobs are created after Cardio check-in and reconciled by `modules/auth/v1/models/qgModel.js`. A Fitment or Hoist task becomes available to QG as soon as its Cardio check-in is active, even if it has not been checked out yet.

`QG_CAFI_START_DATE` controls when QG begins by the vehicle's CAFI date. Use `YYYY-MM-DD`; the default is `2026-09-28`. Checked-in jobs dated on or after this date start as `PENDING`. Earlier CAFI dates are ignored by QG. Unsubmitted jobs from earlier dates are removed during reconciliation; existing inspection history is retained in the database but excluded from QG screens, reports, and exports.

QG reports use Malaysia calendar days (`Asia/Kuala_Lumpur`, UTC+8), based on inspection time. `qg_inspection.inspected_at` stores UTC without an offset; `checkin.checkin_time`, `checkin.checkout_time`, and the copied `qg_job.available_at` store Malaysia wall time. The shared SQL helpers interpret these separately and return timezone-aware timestamps to clients. Do not infer their storage timezone from the PostgreSQL session or add eight hours to installation timestamps. New inspection writes and the schema default explicitly use UTC. Existing timestamp values are not rewritten by this change.

Timezone boundary verification (temporary fixtures only):

```bash
RUN_DB_TESTS=1 node -r dotenv/config --test test/qgTimezone.integration.test.js
```

The application pool now preserves PostgreSQL `timestamp without time zone` and `date` as strings rather than assigning the Node host's timezone. UTC inspection/audit fields and Malaysia installation fields must be interpreted according to their storage convention. Pool sessions use UTC for existing audit defaults; operational “today” queries explicitly use Malaysia time. New installation writes use an explicit Malaysia wall clock. Deploy the updated server and Admin/QG clients together. No historical installation or CA-out timestamps are rewritten; imports that were already shifted require separate source-data verification before correction.
