
const {
  getBayCheckinListByStatus,
  getBayList,
  getStaffEmptyBay,
  quickFromBay,
  selectBayByName,
  addStaff,
  getBayCheckinList,
  getBayHistoryByDate,
  insertBayLog
} = require('../models/bayModel');


require('dotenv').config();

const getBayListByType = async (req, res, next) => {
  const { type } = req.body;

  try {
    const result = await getBayCheckinListByStatus(req, type);

    res.status(200).json({
      success: true,
      message: "Staff inserted successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const getBayCheckinListCtrl = async (req, res, next) => {

  try {
    const result = await getBayCheckinList(req);

    res.status(200).json({
      success: true,
      message: "Staff inserted successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const getBayHistoryCtrl = async (req, res, next) => {
  const { date } = req.body;

  try {
    const result = await getBayHistoryByDate(req, date);

    res.status(200).json({
      success: true,
      message: "Bay history fetched successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};



const getBayListCtrl = async (req, res, next) => {

  try {
    const result = await getBayList(req);

    res.status(200).json({
      success: true,
      message: "Staff inserted successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const getStaffEmptyBayCtrl = async (req, res, next) => {

  try {
    const result = await getStaffEmptyBay(req);

    res.status(200).json({
      success: true,
      message: "Staff inserted successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};


const removeStaff = async (req, res, next) => {

  const { bayid } = req.body;

  console.log(bayid)

  try {
    const removed = await quickFromBay(req , bayid);

    if (Array.isArray(removed)) {
      for (const row of removed) {
        await insertBayLog(req, {
          remark: 'remove-staff',
          staff_id: row?.staff_id,
          bay_id: row?.bay_id,
          action_by: req.user?.id || 4
        });
      }
    }

    res.status(200).json({
      success: true,
      message: "Staff inserted successfully",
      data: removed
    });
  } catch (error) {
    next(error);
  }
};
// 

const insertStafftoBay = async (req, res, next) => {
  const { name, stafflist } = req.body;

  try {
    const searchBay = await selectBayByName(req, name);

    if (!searchBay) {
      return res.status(400).json({
        success: false,
        message: "No Bay Found",
      });
    }

    // Run all inserts in parallel and wait for all to finish
    const inserts = await Promise.all(
      stafflist.map(async (element) => {
        const added = await addStaff(req, element, searchBay.no);
        await insertBayLog(req, {
          remark: 'add-staff',
          staff_id: element,
          bay_id: searchBay.no,
          action_by: req.user?.id || 4
        });
        return added;
      })
    );

    res.status(200).json({
      success: true,
      message: "Staff inserted successfully",
      data: inserts, // return all results
    });
  } catch (error) {
    next(error);
  }
};


module.exports = {
  getBayListByType,
  getBayListCtrl,
  getStaffEmptyBayCtrl,
  removeStaff,
  insertStafftoBay,
  getBayCheckinListCtrl,
  getBayHistoryCtrl
};
