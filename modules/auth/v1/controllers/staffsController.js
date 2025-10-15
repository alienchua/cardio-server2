const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const {
  insertStaffsModel,
  getFullStaff,
  updateStaffBystaff_id
} = require('../models/staffsModel');

require('dotenv').config();

const insertStaffs = async (req, res, next) => {
  const { staffs } = req.body;
  // staffs should be an array of objects with all required fields

  console.log(staffs)

  if (!Array.isArray(staffs) || staffs.length === 0) {
    return res.status(400).json({
      success: false,
      message: "No staff records provided"
    });
  }

  try {
    const result = await insertStaffsModel(req, staffs);

    res.status(200).json({
      success: true,
      message: "Staff inserted successfully",
      insertedCount: result.rowCount
    });
  } catch (error) {
    next(error);
  }
};

const updateStaffBy = async (req, res, next) => {
  const { data } = req.body;
  // staffs should be an array of objects with all required fields

  console.log(data)

  try {

    for (const item of data) {

      await updateStaffBystaff_id(req, item.bank_name, item.acc_number , item.staff_id);

    }
  
    res.status(200).json({
      success: true,
      message: "Staff inserted successfully",
    });
  } catch (error) {
    next(error);
  }
};


const getStaffList = async (req, res, next) => {

  try {
    const result = await getFullStaff(req);

    res.status(200).json({
      success: true,
      message: "Staff inserted successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};
// getFullStaff

module.exports = {
  insertStaffs,
  getStaffList,
  updateStaffBy
};
