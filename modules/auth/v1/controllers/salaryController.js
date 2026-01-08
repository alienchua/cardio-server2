const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const {
  insertInstallment,
  getInstallment,
  getInstallmentByNo,
  getSalaryResult,
  getSalaryDetail,
  getSalaryDetailByBay,
  insertSettlement
} = require('../models/salaryModel');
const { getStaffTaskList } = require('../models/tasksModel');

require('dotenv').config();

const createInstallment = async (req, res, next) => {
  const { amount, remark , installment, staff_jd } = req.body;
  console.log(req.body)
  try {
    // order expected by model: staff_id, amount, installment, remark
    const result = await insertInstallment(req, staff_jd, amount, installment, remark);

    res.status(200).json({
      success: true,
      message: "Staff inserted successfully",
      insertedCount: result.rowCount
    });
  } catch (error) {
    next(error);
  }
};

const getInstallmentCtrl = async (req, res, next) => {

  try {
    const result = await getInstallment(req);

    res.status(200).json({
      success: true,
      message: "Staff inserted successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const getSalaryResultByMonth = async (req, res, next) => {

  const { month } = req.body;

  try {
    const result = await getSalaryResult(req, month);

    res.status(200).json({
      success: true,
      message: "Staff inserted successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const getSalaryDetailByStaff = async (req, res, next) => {

  const { month , staff_id} = req.body;

  try {
    const result = await getSalaryDetail(req, month , staff_id);

    res.status(200).json({
      success: true,
      message: "Staff inserted successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const getSalaryVoucherDetail = async (req, res, next) => {
  const { month, staff_id } = req.body;
  try {
    if (!month || !staff_id) {
      return res.status(400).json({
        success: false,
        message: 'month and staff_id are required'
      });
    }
    const startDate = `${month}-01`;
    const tasks = await getStaffTaskList(req, startDate, staff_id);
    res.status(200).json({
      success: true,
      message: 'Get salary voucher detail successfully',
      data: tasks
    });
  } catch (error) {
    next(error);
  }
};

const getSalaryVoucherDetailByBay = async (req, res, next) => {
  const { month, bay_id } = req.body;
  try {
    if (!month || !bay_id) {
      return res.status(400).json({
        success: false,
        message: 'month and bay_id are required'
      });
    }
    const tasks = await getSalaryDetailByBay(req, month, bay_id);
    res.status(200).json({
      success: true,
      message: 'Get salary voucher detail by bay successfully',
      data: tasks
    });
  } catch (error) {
    next(error);
  }
};

const setSettlement = async (req, res, next) => {

  const { month } = req.body;

  try {
    const result = await insertSettlement(req, month );

    res.status(200).json({
      success: true,
      message: "Staff inserted successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const getInstallmentByNoCtrl = async (req, res, next) => {
  const { no } = req.body;

  try {
    const result = await getInstallmentByNo(req, no);

    res.status(200).json({
      success: true,
      message: "Get installment successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};

// insertSettlement

module.exports = {
  createInstallment,
  getInstallmentCtrl,
  getInstallmentByNoCtrl,
  getSalaryResultByMonth,
  getSalaryDetailByStaff,
  getSalaryVoucherDetail,
  getSalaryVoucherDetailByBay,
  setSettlement
};
