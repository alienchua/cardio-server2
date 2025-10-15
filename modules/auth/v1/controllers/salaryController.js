const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const {
  insertInstallment,
  getInstallment,
  getSalaryResult
} = require('../models/salaryModel');

require('dotenv').config();

const createInstallment = async (req, res, next) => {
  const { amount, remark , installment, staff_jd } = req.body;
  // staffs should be an array of objects with all required fields


  try {
    const result = await insertInstallment(req, amount, remark , installment, staff_jd);

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

  try {
    const result = await getSalaryResult(req);

    res.status(200).json({
      success: true,
      message: "Staff inserted successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};


module.exports = {
  createInstallment,
  getInstallmentCtrl,
  getSalaryResultByMonth
};
