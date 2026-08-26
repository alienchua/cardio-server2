const {
  getBikTaskById,
  getBikTasks,
  createBikTask,
  updateBikTask,
  softDeleteBikTask,
  isBikMonthSettled
} = require('../models/bikModel');

const monthForDate = (date) => String(date || '').slice(0, 7);

const normalizeBikInput = (input = {}) => {
  const requiredText = ['seq', 'chassis', 'installation_date', 'accessory', 'model_description', 'colour'];
  const data = {};
  for (const key of requiredText) data[key] = String(input[key] ?? '').trim();
  data.remarks = String(input.remarks ?? '').trim();

  const bayId = Number(input.bay_id);
  const rawInstallerIds = Array.isArray(input.installer_staff_ids)
    ? input.installer_staff_ids
    : input.installer_staff_id != null ? [input.installer_staff_id] : [];
  const installerStaffIds = [...new Set(rawInstallerIds.map(Number).filter((value) => Number.isInteger(value) && value > 0))];
  const price = Number(input.price);
  const errors = [];
  for (const key of requiredText) if (!data[key]) errors.push(`${key.replace(/_/g, ' ')} is required`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.installation_date)) errors.push('installation date must use YYYY-MM-DD');
  if (!Number.isInteger(bayId) || bayId <= 0) errors.push('bay is required');
  if (installerStaffIds.length === 0) errors.push('at least one installer is required');
  if (!Number.isFinite(price) || price <= 0) errors.push('price must be greater than zero');
  if (errors.length) {
    const error = new Error(errors[0]);
    error.status = 400;
    throw error;
  }

  return {
    ...data,
    bay_id: bayId,
    installer_staff_ids: installerStaffIds,
    price_cents: Math.round(price * 100)
  };
};

const rejectIfSettled = async (req, dates) => {
  const months = [...new Set(dates.map(monthForDate).filter(Boolean))];
  for (const month of months) {
    if (await isBikMonthSettled(req, month)) {
      const error = new Error(`Cannot change BIK because salary month ${month} is settled`);
      error.status = 400;
      throw error;
    }
  }
};

const getBikTasksCtrl = async (req, res, next) => {
  try {
    const { date_from, date_to } = req.body || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date_from || '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(date_to || ''))) {
      return res.status(400).json({ success: false, message: 'date_from and date_to are required in YYYY-MM-DD format' });
    }
    const data = await getBikTasks(req, { dateFrom: date_from, dateTo: date_to });
    res.status(200).json({ success: true, message: 'BIK tasks loaded', data });
  } catch (error) {
    next(error);
  }
};

const createBikTaskCtrl = async (req, res, next) => {
  try {
    const data = normalizeBikInput(req.body);
    await rejectIfSettled(req, [data.installation_date]);
    const created = await createBikTask(req, data, req.user?.id || null);
    res.status(201).json({ success: true, message: 'BIK task created', data: created });
  } catch (error) {
    next(error);
  }
};

const updateBikTaskCtrl = async (req, res, next) => {
  try {
    const no = Number(req.body?.no);
    if (!Number.isInteger(no) || no <= 0) return res.status(400).json({ success: false, message: 'Valid BIK task number is required' });
    const existing = await getBikTaskById(req, no);
    if (!existing) return res.status(404).json({ success: false, message: 'BIK task not found' });
    const data = normalizeBikInput(req.body);
    await rejectIfSettled(req, [existing.installation_date, data.installation_date]);
    const updated = await updateBikTask(req, no, data, req.user?.id || null);
    res.status(200).json({ success: true, message: 'BIK task updated', data: updated });
  } catch (error) {
    next(error);
  }
};

const deleteBikTaskCtrl = async (req, res, next) => {
  try {
    const no = Number(req.body?.no);
    if (!Number.isInteger(no) || no <= 0) return res.status(400).json({ success: false, message: 'Valid BIK task number is required' });
    const existing = await getBikTaskById(req, no);
    if (!existing) return res.status(404).json({ success: false, message: 'BIK task not found' });
    await rejectIfSettled(req, [existing.installation_date]);
    await softDeleteBikTask(req, no, req.user?.id || null);
    res.status(200).json({ success: true, message: 'BIK task deleted' });
  } catch (error) {
    next(error);
  }
};

module.exports = { getBikTasksCtrl, createBikTaskCtrl, updateBikTaskCtrl, deleteBikTaskCtrl };
