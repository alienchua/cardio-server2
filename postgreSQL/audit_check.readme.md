# Supervisor Audit Check

Audit Check is a separate workflow in the QG mobile app and admin QG dashboard. Supervisors and superadmins can submit or cancel audits. Other authenticated admin accounts can read results. Permissions are enforced by the API and model, not only by the UI.

## Deploy

Apply existing QG migrations first, then run `npm run migrate:audit` with the target database configuration before deploying the updated server, admin panel and QG app. The additive migration is safe to rerun. The new QG queries reference audit tables, so database-first ordering is required. This feature has been applied and tested locally; production deployment is separate.

Audit records, defect snapshots and photo metadata are stored in `audit_inspection`, `audit_inspection_defect` and `audit_defect_photo`. Photos use the existing private storage configuration with an `audit/defects/` prefix and signed upload receipts bound to the supervisor and job. QG photo receipts cannot be reused as audit evidence.

## Behaviour

- Choose an existing active vehicle task by fitment ID/chassis, or scan in the mobile app. Record Passed or Defect, remarks and defect photos.
- Each audit snapshots the QG result at submission. QG status, approval/rework workflow and QG statistics remain unchanged.
- QG lists/details and inspection exports display the latest noncancelled supervisor audit separately. Repeated audits retain their history; cancellation falls back to the previous active audit, or Not audited when none remain.
- Cancellation requires a reason and retains the original result, photos, actor and timestamp. Submit a fresh audit to correct a cancelled record.
- Times are stored as timezone-aware instants. Date filters and displayed times use Asia/Kuala_Lumpur (MYT, UTC+08:00). Counts represent audit executions, including repeat audits, not unique cars.
- Submission keys make retries safe; changing a submitted payload or reusing a cancelled key is rejected.

## Verification

Run `RUN_DB_TESTS=1 node -r dotenv/config --test test/auditInspection.integration.test.js test/qg*.test.js test/malaysiaTime.test.js`. Database tests create temporary fixtures and do not edit application records. Run `npm run build` in each frontend repository.

For isolated browser verification, run `RUN_AUDIT_BROWSER_TESTS=1 node scripts/auditBrowserFixture.js` and point the local frontend's VITE_API_BASE_URL at http://127.0.0.1:5188. The fixture binds only to localhost, uses synthetic accounts and temporary database tables, and mocks cloud storage. Never deploy it as an application server. Stop it after testing to discard the fixtures. Live cloud photo storage was not exercised by this fixture.

`AuditChecks.tsx` and `AuditChecks.css` are intentionally copied between the separately deployed admin and QG repositories. Keep both copies identical when editing the shared audit UI.
