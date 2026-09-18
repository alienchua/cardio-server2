const {
  getDashboard,
  resolveScan,
  getJobDetail,
  getDefectIssues,
  submitInspection,
  listInspections
} = require('../models/qgModel');

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
      return res.status(400).json({ success: false, message: 'Scan value is required' });
    }
    const matches = await resolveScan(req, scanValue);
    if (matches.length === 0) {
      return res.status(404).json({ success: false, message: 'No ready QG task matches this code' });
    }
    if (matches.length > 1) {
      return res.status(409).json({ success: false, message: 'More than one vehicle matches this code', data: matches });
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

module.exports = { dashboard, scan, detail, issues, submit, inspections };
