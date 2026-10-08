const model = require('../models/auditModel');
const { uploadPhoto } = require('../../../../utils/auditPhoto');
const handle = (action, status = 200) => async (req, res, next) => {
  try { res.status(status).json({ success: true, data: await action(req) }); }
  catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    next(error);
  }
};
module.exports = {
  capabilities: handle(async req => ({ can_write: model.canWrite(req), auditors: (await req.app.get('pool').query('SELECT DISTINCT a.id, a.username AS name FROM admins a JOIN audit_inspection ai ON ai.audited_by = a.id ORDER BY a.username, a.id')).rows })),
  jobs: handle(req => model.lookupJobs(req, req.query.search)),
  job: handle(req => model.getAuditJob(req, req.params.jobId)),
  list: handle(req => model.listAudits(req, req.query)),
  detail: handle(req => model.getAudit(req, req.params.auditId)),
  submit: handle(req => model.submitAudit(req, req.params.jobId, req.body || {}), 201),
  cancel: handle(req => model.cancelAudit(req, req.params.auditId, req.body?.reason)),
  photo: handle(async req => {
    model.requireWriter(req);
    await model.getAuditJob(req, req.params.jobId);
    return uploadPhoto({ buffer: req.body, contentType: req.get('Content-Type')?.split(';')[0], jobId: req.params.jobId, userId: req.user.id });
  }, 201)
};
