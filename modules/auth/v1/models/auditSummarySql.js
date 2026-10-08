// Only server-owned column expressions are passed here.
const latestAuditSql = jobId => `(SELECT jsonb_build_object('id', ai.id, 'result', ai.result,
  'inspected_at', ai.inspected_at, 'inspector', auditor.username)
  FROM audit_inspection ai JOIN admins auditor ON auditor.id = ai.audited_by
  WHERE ai.qg_job_id = ${jobId} AND ai.voided_at IS NULL ORDER BY ai.id DESC LIMIT 1)`;
module.exports = { latestAuditSql };
