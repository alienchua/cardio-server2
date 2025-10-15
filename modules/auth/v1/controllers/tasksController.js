const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const {
  insertMasterlist,
  searchCheckIN,
  insertTaskItem,
  insertCheckIN,
  searchMasterlist,
  insertCheckInStaff,
  updateCheckIn,
  getCheckInList,
  getMasterList,
  getMasterList2,
  getMasterListByNo,
  getTasksList,
  getTasksAnalisys,
  getCheckInByMasterNo,
  getCheckInByMasterNo2,
  getItemByMasterNo,
  getCheckInStaff,
  insertTaskOffset,
  getTaskOffset,
  checkType,
  checkCheckinStaff,
  checkCheckinNumber,
  getTasksList2,
  getTasksAnalisys2,
  deleteCheckinStaff
} = require('../models/tasksModel');

const {
  insertAccessory,
  findAccessory
} = require('../models/accessoriesModel');
const {
  selectBayStaff
} = require('../models/bayModel');
require('dotenv').config();


const insertMasterlistWithAccessories = async (req, res, next) => {
  const masterlistArray = req.body;

  try {
    const limitedData = masterlistArray; // test 3 only

    for (const item of limitedData) {
      // 1. insert masterlist
      const masterlistId = await insertMasterlist(req, item);

      // 2. process accessories
      for (const acc of item.accessories || []) {
        let accessoryRow = await findAccessory(req, acc);

        let accessoryId;
        // console.log('accessoryRow', accessoryRow);

        if (!accessoryRow) {
          // console.log("Accessory not found, inserting new:", acc);
          // not exist → insert
          accessoryId = await insertAccessory(req, acc);
        } else {
          accessoryId = accessoryRow.no;
        }

        // 3. insert into task_item
        await insertTaskItem(req, {
          masterlist_id: masterlistId,
          accessories_id: accessoryId,
          price: accessoryRow?.price || 0,
          duration: accessoryRow?.duration || null,
          type: accessoryRow?.type || null,
          short_name: accessoryRow?.short_name || null,
        });
      }
    }

    res.status(200).json({ success: true, message: "Inserted with accessories check ✅" });
  } catch (err) {
    next(err);
  }
};

const checkInTask = async (req, res, next) => {

  const {  chassis, fitment , bay_id , type} = req.body;

  try {

    const serachMaster = await searchMasterlist(req, chassis, fitment);
    if (!serachMaster) {
      return res.status(400).json({
        success: false,
        message: "Masterlist not found"
      });
    }

    const checkGotType = await checkType(req, serachMaster.no , type);

    if (!checkGotType) {
      return res.status(400).json({
        success: false,
        message: "this Task Don't have" + type + ' Item'
      });
    }
 
    const checkNumber = await checkCheckinNumber(req, bay_id );

    console.log('checkNumber', checkNumber);

    if (checkNumber.total >= 2) {
      return res.status(400).json({
        success: false,
        message: "This Bay is full"
      });
    }
    // checkType

    const existing = await searchCheckIN(req, serachMaster.no , type);

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Check-IN already exists for this masterlist"
      });
    }

    const result = await insertCheckIN(req, serachMaster.no , 3 , bay_id , 'Check-In', type);

    const bayStaff = await selectBayStaff(req, bay_id);

    for (const staff of bayStaff) {
      await insertCheckInStaff(req, result.no, staff.staff_id , staff.type);
    }

    res.status(200).json({
      success: true,
      message: "Check In successfully",
      insertedCount: result.rowCount
    });
  } catch (error) {
    next(error);
  }
};

const checkOutTask = async (req, res, next) => {

  const {   masterlist_id , remark   , type} = req.body;

  try {

    const result = await updateCheckIn(req,  masterlist_id , remark , type );

    res.status(200).json({
      success: true,
      message: "Check Out successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const getCheckInListCrtl = async (req, res, next) => {

  try {

    const result = await getCheckInList(req);

    res.status(200).json({
      success: true,
      message: "Get Check In List successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const getTasksListCtrl = async (req, res, next) => {

  try {

    const result = await getTasksList(req);
    const analysis = await getTasksAnalisys(req)

    res.status(200).json({
      success: true,
      message: "Get Check In List successfully",
      data: result,
      analysis :analysis
    });
  } catch (error) {
    next(error);
  }
};

const getTasksListCtrl2 = async (req, res, next) => {


  const {  chassis , fitment_id , model , seq , date_from  ,date_to  , type} = req.body;


  try {

    let data ={
      chassis : chassis, 
      fitment_id : fitment_id , 
      model : model , 
      seq : seq, 
      date_from : date_from ,
      date_to : date_to,
      type : type
    }

    const result = await getTasksList2(req , data);
    const analysis = await getTasksAnalisys2(req , data)

    res.status(200).json({
      success: true,
      message: "Get Check In List successfully",
      data: result,
      analysis :analysis
    });
  } catch (error) {
    next(error);
  }
};

const getMasterListCtrl = async (req, res, next) => {

  try {

    const result = await getMasterList(req);

    res.status(200).json({
      success: true,
      message: "Get Check In List successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const getMasterListCtrl2 = async (req, res, next) => {
  const {  chassis , fitment_id , model , seq , date_from  ,date_to  } = req.body;

  try {

    let data ={
      chassis : chassis, 
      fitment_id : fitment_id , 
      model : model , 
      seq : seq, 
      date_from : date_from ,
      date_to : date_to
    }

    const result = await getMasterList2(req , data);

    res.status(200).json({
      success: true,
      message: "Get Check In List successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const getMasterDetail = async (req, res, next) => {

  const {   masterlist_id   } = req.body;

  try {

    const master = await getMasterListByNo(req, masterlist_id);
    const checkin = await getCheckInByMasterNo(req, masterlist_id);
    const checkin2 = await getCheckInByMasterNo2(req, masterlist_id);
    const item = await getItemByMasterNo(req, masterlist_id);
    const compenset = await getTaskOffset(req, masterlist_id);
    let staff = [];

    if(checkin){
       staff = await getCheckInStaff(req, checkin.no);

    }

    res.status(200).json({
      success: true,
      message: "Get Check In List successfully",
      master: master,
      checkin : checkin,
      item : item,
      staff : staff,
      compenset :compenset,
      checkin2 : checkin2
    });
  } catch (error) {
    next(error);
  }
};

const taskOffset = async (req, res, next) => {


  const {  masterlist_id , action_by , amount , remark , staff_id  ,amount2  } = req.body;

  try {

    const result = await insertTaskOffset(req, masterlist_id , action_by , amount , remark , staff_id  ,amount2);

    res.status(200).json({
      success: true,
      message: "Get Check In List successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const deleteCheckinStaffCtrl = async (req, res, next) => {


  const {  checkin_id  } = req.body;

  try {

    const result = await deleteCheckinStaff(req, checkin_id);

    res.status(200).json({
      success: true,
      message: "Get Check In List successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};


module.exports = {
  insertMasterlistWithAccessories,
  checkInTask,
  checkOutTask,
  getCheckInListCrtl,
  getMasterListCtrl,
  getMasterDetail,
  taskOffset,
  getTasksListCtrl,
  getTasksListCtrl2,
  getMasterListCtrl2,
  deleteCheckinStaffCtrl
};
