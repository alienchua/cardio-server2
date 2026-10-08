const { uploadPhoto } = require('../../../../utils/qgPhoto');
const {
  getDashboard,
  listPendingJobs,
  resolveScan,
  getJobDetail,
  getDefectIssues,
  getDefectOptions,
  saveDefectOptions,
  submitInspection,
  listInspections,
  getInspectionExport,
  getInspectionDetail,
  approveInspectionDefect,
  cancelInspection
} = require('../models/qgModel');

const pending = async (req, res, next) => {
  try {
    const data = await listPendingJobs(req);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const dashboard = async (req, res, next) => {
  try {
    const data = await getDashboard(req, req.query || {});
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const scan = async (req, res, next) => {
  try {
    const scanValue = String(req.body?.scan_value || '').trim();
    if (!scanValue) {
      return res.status(400).json({ success: false, message: 'Fitment ID is required' });
    }
    const matches = await resolveScan(req, scanValue);
    if (matches.length === 0) {
      return res.status(404).json({ success: false, message: 'No QG task matches this Fitment ID' });
    }
    if (matches.length > 1) {
      return res.status(409).json({ success: false, message: 'More than one vehicle matches this Fitment ID', data: matches });
    }
    res.status(200).json({ success: true, data: matches[0] });
  } catch (error) {
    next(error);
  }
};

const detail = async (req, res, next) => {
  try {
    const data = await getJobDetail(req, req.params.jobId);
    if (!data) {
      return res.status(404).json({ success: false, message: 'QG task not found' });
    }
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const issues = async (req, res, next) => {
  try {
    const data = await getDefectIssues(req, req.query.task_type);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const options = async (req, res, next) => {
  try {
    const data = await getDefectOptions(req, req.query.task_type);
    res.status(200).json({ success: true, data });
  } catch (error) { next(error); }
};

const updateOptions = async (req, res, next) => {
  try {
    const data = await saveDefectOptions(req, req.params.category, req.body?.options);
    res.status(200).json({ success: true, data });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    next(error);
  }
};

const submit = async (req, res, next) => {
  try {
    const data = await submitInspection(req, req.params.jobId, req.body || {}, req.user.id);
    res.status(201).json({ success: true, message: 'QG inspection submitted', data });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    next(error);
  }
};

const inspections = async (req, res, next) => {
  try {
    const data = await listInspections(req, req.query || {});
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const exportInspections = async (req, res, next) => {
  try {
    const data = await getInspectionExport(req);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const inspectionDetail = async (req, res, next) => {
  try {
    if (!/^\d+$/.test(req.params.inspectionId)) return res.status(400).json({ success: false, message: 'Invalid inspection' });
    const data = await getInspectionDetail(req, req.params.inspectionId);
    if (!data) return res.status(404).json({ success: false, message: 'Inspection not found' });
    res.status(200).json({ success: true, data });
  } catch (error) { next(error); }
};

const approveDefect = async (req, res, next) => {
  try {
    const data = await approveInspectionDefect(req, req.params.inspectionId, req.params.defectId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    next(error);
  }
};

const cancelCheck = async (req, res, next) => {
  try {
    const data = await cancelInspection(req, req.params.inspectionId, req.body?.reason);
    res.status(200).json({ success: true, message: 'QG check cancelled. The task can be checked again.', data });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    next(error);
  }
};

const photo = async (req, res, next) => {
  try {
    if (!/^\d+$/.test(req.params.jobId)) return res.status(400).json({ success: false, message: 'Invalid QG task' });
    const job = await getJobDetail(req, req.params.jobId);
    if (!job) return res.status(404).json({ success: false, message: 'QG task not found' });
    if (job.qg_status !== 'PENDING') return res.status(409).json({ success: false, message: 'This QG task has already been submitted' });
    const data = await uploadPhoto({ buffer: req.body, contentType: req.get('Content-Type')?.split(';')[0], jobId: req.params.jobId, userId: req.user.id });
    res.status(201).json({ success: true, data });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ success: false, message: error.message });
    console.error('[QG photo]', error.message);
    res.status(502).json({ success: false, message: 'Photo could not be saved. Please try again.' });
  }
};

module.exports = { dashboard, pending, scan, detail, issues, options, updateOptions, submit, inspections, exportInspections, inspectionDetail, approveDefect, cancelCheck, photo };
