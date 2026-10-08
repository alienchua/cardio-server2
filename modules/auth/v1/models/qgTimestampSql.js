// Inspection timestamps store UTC wall time; legacy installation timestamps
// (including qg_job.available_at copied from checkin) store Malaysia wall time.
// Interpret the storage timezone explicitly, independently of the DB session.
const instant = (column) => `(${column} AT TIME ZONE 'UTC')`;
const installationInstant = (column) => `(${column} AT TIME ZONE 'Asia/Kuala_Lumpur')`;
const malaysiaLocal = (column) => `(${instant(column)} AT TIME ZONE 'Asia/Kuala_Lumpur')`;
const malaysiaDate = (column) => `${malaysiaLocal(column)}::date`;

module.exports = { instant, installationInstant, malaysiaLocal, malaysiaDate };
