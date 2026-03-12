const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('pg');


const {
  insertStaffsModel,
  getFullStaff,
  updateStaffBystaff_id,
  insertStaff
} = require('../models/staffsModel');
const { upsertAttendance } = require('../models/staffAttendanceModel');

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
  try {
    let raw = req.body?.data ?? req.body;

    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch (parseErr) {
        console.error('[updateStaffBy] failed to parse string body:', parseErr);
      }
    }

    const payload = Array.isArray(raw) ? raw : [raw];
    const updates = payload.filter((item) => item && typeof item === 'object' && Object.keys(item).length > 0);

    console.log('[updateStaffBy] incoming body type:', typeof req.body, 'raw type:', Array.isArray(raw) ? 'array' : typeof raw);
    console.log('[updateStaffBy] incoming raw:', JSON.stringify(raw));
    console.log('[updateStaffBy] normalized updates:', JSON.stringify(updates));

    if (!updates.length) {
      return res.status(400).json({
        success: false,
        message: 'No staff updates provided'
      });
    }

    const results = [];
    for (const item of updates) {
      const updated = await updateStaffBystaff_id(req, item);
      results.push(updated);
    }

    res.status(200).json({
      success: true,
      message: `Updated ${results.length} staff record${results.length > 1 ? 's' : ''}`,
      data: Array.isArray(req.body?.data) ? results : results[0]
    });
  } catch (error) {
    console.error('[updateStaffBy] error:', error?.message, 'stack:', error?.stack, 'body:', req.body);
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

const updateStaffBay = async (req, res, next) => {

  const updates = req.body; // expect array of objects

  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({ message: "No updates provided" });
  }
  const client = await req.app.get('pool');
  // const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const results = [];

    for (const u of updates) {
      console.log(u)
      const { bay , staff_id } = u;

      const query = `
        UPDATE staff SET bay = $1 WHERE staff_id = $2;
      `;

      const values = [bay , staff_id];
      const result = await client.query(query, values);
      results.push(result.rows[0]);

    }

    await client.query("COMMIT");
    res.json({ success: true, updated: results });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Update failed:", err);
    res.status(500).json({ message: "Update failed", error: err.message });
  } finally {
    client.release();
  }

}

const uploadStaffAttendance = async (req, res, next) => {
  try {
    const { month, records } = req.body;

    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No attendance records provided'
      });
    }

    const normalized = records.map((r) => ({
      staff_id: r.staff_id || r.id,
      month_label: r.month_label || r.month || month,
      attendance: Number(r.attendance ?? r.attandence ?? 0)
    })).filter((r) => r.staff_id && r.month_label);

    if (normalized.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Attendance records missing staff_id or month'
      });
    }

    const result = await upsertAttendance(req, normalized);

    res.status(200).json({
      success: true,
      message: 'Attendance uploaded',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const createStaff = async (req, res, next) => {
  const staff = req.body;
  if (!staff || !staff.name) {
    return res.status(400).json({ success: false, message: 'Name is required' });
  }

  try {
    const row = await insertStaff(req, staff);
    res.status(200).json({
      success: true,
      message: 'Staff created successfully',
      data: row
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  insertStaffs,
  getStaffList,
  updateStaffBy,
  updateStaffBay,
  uploadStaffAttendance,
  createStaff
};
