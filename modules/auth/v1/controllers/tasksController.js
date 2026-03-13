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
  getTasksStatusNullCount,
  getAchievementList,
  getAchievementAnalysis,
  getHourlyCompletedStats,
  deleteCheckinStaff,
  getStandyList,
  updatePickup,
  getPickUpList,
  updatePickupTime,
  getCheckInList2,
  updateCheckInRemark,
  getStandbyList,
  updateCheckInNew,
  getCheckINByNo,
  updateReady,
  getFitmentCurrentCheckin,
  updatePreparing,
  getCollectScreen,
  getCurrentCheckin,
  getBayCurrentCheckin,
  searchMasterlistByno,
  findMasterByChassisSeq,
  findStaffNosByStaffIds,
  insertManualCheckIn,
  getTaskbyNoandType,
  getCheckinByNoandType,
  getCheckinByNo,
  getTaskbyNo,
  getStaffTaskList,
  deleteCheckStaff,
  getPickCheckin,
  standbyHistory,
  cancelMasterlistByRange,
  inactiveMaster,
  getMasterBacklogCount,
  getTasksBacklogCount,
  getDashboardStats,
  insertCheckInStaffBatch,
  getLastOpenCafiDate
} = require('../models/tasksModel');

const {
  insertAccessory,
  findAccessory
} = require('../models/accessoriesModel');
const {
  selectBayStaff,
  selectBayByName
} = require('../models/bayModel');
const {
  getStaffById
} = require('../models/staffsModel');
const { broadcastToTopic, broadcastToTopics } = require('../../../realtime/v1/config/websocketConfig');

require('dotenv').config();


const insertMasterlistWithAccessories = async (req, res, next) => {
  const masterlistArray = req.body;

  try {
    // console.log('[insertMasterlistWithAccessories] received', {
    //   count: Array.isArray(masterlistArray) ? masterlistArray.length : 0,
    //   sample: Array.isArray(masterlistArray) ? masterlistArray[0] : masterlistArray
    // });
    const limitedData = masterlistArray; // you can slice if testing only a few items

    for (const item of limitedData) {
      // console.log('[insertMasterlistWithAccessories] processing item', item);
      // 1. insert or update masterlist
      const masterlistResult = await insertMasterlist(req, item);
      const { id, operation } = masterlistResult;
      // console.log('[insertMasterlistWithAccessories] masterlist result', masterlistResult);
      if (operation === 'inserted') {
        // 2. process accessories only for new records
        for (const acc of item.accessories || []) {
          // console.log('[insertMasterlistWithAccessories] accessory', acc);
          // Check if accessory exists
          let accessoryRow = await findAccessory(req, acc);

          let accessoryId;
          if (!accessoryRow) {
            // not exist → insert new accessory
            accessoryId = await insertAccessory(req, acc);
          } else {
            accessoryId = accessoryRow.no;
          }
          // console.log('[insertMasterlistWithAccessories] linking accessory', { accessoryId, masterlistId: id });

          // 3. link accessory to masterlist
          await insertTaskItem(req, {
            masterlist_id: id, // ✅ use the id from masterlistResult
            accessories_id: accessoryId,
            price: accessoryRow?.price || 0,
            duration: accessoryRow?.duration || null,
            type: accessoryRow?.type || null,
            short_name: accessoryRow?.short_name || null,
          });
        }
      }

    }

    res.status(200).json({
      success: true,
      message: "Inserted/updated masterlist with accessories ✅"
    });
  } catch (err) {
    console.error('[insertMasterlistWithAccessories] error', err);
    next(err);
  }
};

const checkInTask = async (req, res, next) => {

  const {  chassis, fitment , bay_id , type , status} = req.body;

  console.log(chassis, fitment , bay_id , type , status)
  try {

    const serachMaster = await searchMasterlist(req, chassis, fitment);
    if (!serachMaster) {
      return res.status(400).json({
        success: false,
        message: "Masterlist not found"
      });
    }

    const fitmentModelCodes = new Set([
      'GUN125R-DEFSXEQ2',
      'GUN125R-DETSXEQ3',
      'GUN125R-BEFLXEQ1',
      'KDH201R-RBMDYEL3'
    ]);
    const modelCodeKey = String(serachMaster.model_code || '').trim().toUpperCase();
    const effectiveType = fitmentModelCodes.has(modelCodeKey) ? 'FITMENT' : type;

    const newItems = await getTaskbyNoandType(req, serachMaster.no, 'New');
    
    if (Array.isArray(newItems) && newItems.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot check in while New task items exist"
      });
    }

  
    const checkGotType = await checkType(req, serachMaster.no , effectiveType);

    if (!checkGotType) {
      return res.status(400).json({
        success: false,
        message: "this Task Don't have" + effectiveType + ' Item'
      });
    }
 
    if(status === 'Check-In'){
      
      const checkNumber = await checkCheckinNumber(req, bay_id );
  
      if (checkNumber.total >= 3) {
        return res.status(400).json({
          success: false,
          message: "This Bay is full"
        });
      }
    }

    // checkType

    
    const existing = await searchCheckIN(req, serachMaster.no , effectiveType);

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Check-IN already exists for this masterlist"
      });
    }

   
    const result = await insertCheckIN(req, serachMaster.no , 4 , bay_id , status, effectiveType);

    const bayStaff = await selectBayStaff(req, bay_id);

    for (const staff of bayStaff) {
      await insertCheckInStaff(req, result.no, staff.staff_id , staff.type);
    }

    res.status(200).json({
      success: true,
      message: "Check In successfully",
      insertedCount: 1,
      checkin_no: result.no
    });

    broadcastToTopics(
      ['pickCheckin', 'getPickCheckinCtrl', 'standbyToday', 'getStandyListToday'],
      { type: 'refresh', source: 'checkInTask' }
    );
  } catch (error) {
    next(error);
  }
  
};

const checkOutTask = async (req, res, next) => {

  const { masterlist_id , type} = req.body;

  try {

    const result = await updateCheckIn(req,  masterlist_id  , type );

    res.status(200).json({
      success: true,
      message: "Check Out successfully",
      data: result
    });
    broadcastToTopics(
      ['collectScreen', 'getCollectScreenCtrl', 'pickCheckin', 'getPickCheckinCtrl', 'standbyToday', 'getStandyListToday', 'currentCheckin', 'getCurrentCheckInCtrl'],
      { type: 'refresh', source: 'checkOutTask' }
    );
  } catch (error) {
    next(error);
  }

};

const manualCheckin = async (req, res, next) => {
  const payload = Array.isArray(req.body) ? req.body : [req.body];
  const results = [];
  const errors = [];
  const defaultDate = new Date('2025-12-24T00:00:00Z');
  const actionBy = req.user?.id || 4; // fallback to admin id 4

  console.log('[manualCheckin] received payload count:', payload.length);

  for (const entry of payload) {
    try {
      const { bay, staff = [], seq, chassis, type = 'FITMENT', remark } = entry || {};

      if (!bay || !seq || !chassis || !Array.isArray(staff) || staff.length === 0) {
        errors.push({ bay, seq, chassis, message: 'Missing bay, seq, chassis or staff list' });
        continue;
      }

      const master = await findMasterByChassisSeq(req, chassis, seq);
      if (!master) {
        errors.push({ bay, seq, chassis, message: 'Masterlist not found' });
        continue;
      }

      const bayRow = await selectBayByName(req, bay);
      if (!bayRow) {
        errors.push({ bay, seq, chassis, message: 'Bay not found' });
        continue;
      }

      const staffRows = await findStaffNosByStaffIds(req, staff);
      const missingStaff = staff.filter(
        (id) => !staffRows.find((row) => Number(row.staff_id) === Number(id))
      );
      if (missingStaff.length) {
        errors.push({ bay, seq, chassis, missingStaff, message: 'Some staff_id not found' });
        continue;
      }

      const checkin = await insertManualCheckIn(req, {
        masterlist_id: master.no,
        action_by: actionBy,
        bay_id: bayRow.no,
        status: 'Check-Out',
        type,
        checkin_time: defaultDate,
        checkout_time: defaultDate,
        remark: remark || 'Manual check-out import'
      });

      for (const staffRow of staffRows) {
        await insertCheckInStaff(req, checkin.no, staffRow.no, staffRow.type || null);
      }

      results.push({
        bay: bayRow.name,
        masterlist_id: master.no,
        checkin_no: checkin.no,
        staff_count: staffRows.length
      });
    } catch (error) {
      errors.push({ entry, message: error?.message || 'Unexpected error' });
    }
  }

  const responseBody = {
    success: errors.length === 0,
    message: errors.length ? 'Manual check-in completed with some errors' : 'Manual check-in completed',
    total: payload.length,
    succeeded: results.length,
    failed: errors.length,
    data: results,
    errors
  };

  console.log('[manualCheckin] summary:', responseBody);

  res.status(errors.length ? 400 : 200).json(responseBody);
};

const checkRemark = async (req, res, next) => {

  const { masterlist_id , type , remark } = req.body;

  console.log(masterlist_id , type , remark)

  try {

    const result = await updateCheckInRemark(req,  masterlist_id  , type , remark);

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

  const {  chassis , fitment_id , fitment_type, model , seq , date_from  ,date_to  , type, status, date_field, page, page_size, include_analysis } = req.body;

  try {
    const today = new Date().toISOString().slice(0, 10);
    const pageNum = Math.max(1, Number(page) || 1);
    const pageSizeNum = Math.max(1, Math.min(Number(page_size) || 50, 200));
    const offset = (pageNum - 1) * pageSizeNum;
    let data ={
      chassis : chassis, 
      fitment_id : fitment_id , 
      model : model , 
      seq : seq, 
      fitment_type: fitment_type,
      date_from : date_from || today,
      date_to : date_to || date_from || today,
      type : type,
      status: status,
      date_field: date_field,
      limit: pageSizeNum,
      offset
    }

    const { rows, total } = await getTasksList2(req , data);

    const shouldIncludeAnalysis = include_analysis !== false && include_analysis !== 'false';
    let analysis = [];

    if (shouldIncludeAnalysis) {
      // Build summary from all filtered rows (ignore status filter + ignore pagination).
      const summaryData = {
        ...data,
        status: undefined,
        no_pagination: true,
        skip_count: true
      };
      const { rows: summaryRows } = await getTasksList2(req, summaryData);
      const summary = (summaryRows || []).reduce(
        (acc, row) => {
          if (row?.status === 'Check-Out') acc.completed += 1;
          else if (row?.status === 'Check-In') acc.working += 1;
          else acc.pending += 1;
          return acc;
        },
        { completed: 0, working: 0, pending: 0 }
      );

      analysis = [
        { status: 'Check-Out', count: summary.completed },
        { status: 'Check-In', count: summary.working },
        { status: null, count: summary.pending }
      ];
    }

    res.status(200).json({
      success: true,
      message: "Get Check In List successfully",
      data: rows,
      analysis :analysis,
      pagination: {
        page: pageNum,
        page_size: pageSizeNum,
        total,
        total_pages: Math.max(1, Math.ceil(total / pageSizeNum))
      }
    });
  } catch (error) {
    next(error);
  }

};

const getTasksReportCtrl = async (req, res, next) => {
  const { chassis, fitment_id, fitment_type, model, seq, date_from, date_to, type, status, date_field } = req.body;

  try {
    const today = new Date().toISOString().slice(0, 10);
    const data = {
      chassis,
      fitment_id,
      fitment_type,
      model,
      seq,
      date_from: date_from || today,
      date_to: date_to || date_from || today,
      type,
      status,
      date_field,
      // Export path: skip count/pagination work in model.
      no_pagination: true,
      skip_count: true
    };

    const { rows } = await getTasksList2(req, data);
    res.status(200).json({
      success: true,
      message: 'Get Task Report successfully',
      data: rows
    });
  } catch (error) {
    next(error);
  }
};

const getAchievementListCtrl = async (req, res, next) => {

  const { chassis, fitment_id, fitment_type, model, model_code, seq, date_from, date_to, date_field, bay, page, page_size } = req.body;

  try {
    const today = new Date().toISOString().slice(0, 10);
    const pageNum = Math.max(1, Number(page) || 1);
    const pageSizeNum = Math.max(1, Math.min(Number(page_size) || 10000, 20000));
    const offset = (pageNum - 1) * pageSizeNum;
    const data = {
      chassis,
      fitment_id,
      model,
      model_code,
      seq,
      bay,
      date_field,
      fitment_type,
      date_from: date_from || today,
      date_to: date_to || date_from || today,
      limit: pageSizeNum,
      offset
    };

    const result = await getAchievementList(req, data);
    const analysis = await getAchievementAnalysis(req, data);

    res.status(200).json({
      success: true,
      message: "Get achievement list successfully",
      data: result,
      analysis
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

const getMasterBacklogCountCtrl = async (req, res, next) => {
  try {
    const count = await getMasterBacklogCount(req);

    res.status(200).json({
      success: true,
      message: "Get master backlog successfully",
      data: { count }
    });
  } catch (error) {
    next(error);
  }
};

const getLastOpenCafiDateCtrl = async (req, res, next) => {
  try {
    const cafiDate = await getLastOpenCafiDate(req);
    res.status(200).json({
      success: true,
      message: 'Fetched last open cafi_date successfully',
      data: cafiDate
    });
  } catch (error) {
    next(error);
  }
};

const getHourlyCompletedStatsCtrl = async (req, res, next) => {
  try {
    const result = await getHourlyCompletedStats(req);
    res.status(200).json({
      success: true,
      message: "Get hourly completed stats successfully",
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

const getTasksBacklogCountCtrl = async (req, res, next) => {
  try {
    const count = await getTasksBacklogCount(req);

    res.status(200).json({
      success: true,
      message: "Get task backlog successfully",
      data: { count }
    });
  } catch (error) {
    next(error);
  }
};

const getTasksStatusNullCountCtrl = async (req, res, next) => {
  try {
    const count = await getTasksStatusNullCount(req);

    res.status(200).json({
      success: true,
      message: "Get task count successfully",
      data: { count }
    });
  } catch (error) {
    next(error);
  }
};

const getDashboardStatsCtrl = async (req, res, next) => {
  try {
    const stats = await getDashboardStats(req);

    res.status(200).json({
      success: true,
      message: "Get dashboard stats successfully",
      data: stats
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

const addCheckinStaffCtrl = async (req, res, next) => {
  const { checkin_id, staff_ids } = req.body;

  try {
    if (!checkin_id || !Array.isArray(staff_ids) || staff_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "checkin_id and staff_ids are required"
      });
    }

    const result = await insertCheckInStaffBatch(req, checkin_id, staff_ids);

    res.status(200).json({
      success: true,
      message: "Staff added successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const getStandyListToday = async (req, res, next) => {

  const {  type  } = req.body;

  try {

    const result = await getStandyList(req , type);

    res.status(200).json({
      success: true,
      message: "Get Check In List successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const pickStandby = async (req, res, next) => {

  const {  no  , type  } = req.body;

  console.log(no , type)

  try {

    let result
    // updateReady
    if(type == 'Ready'){
      console.log('run here')
       result = await updatePickup(req , no);
    } 
   else if(type == 'Pending'){
       result = await updatePreparing(req , no);
    }
    else if(type == 'Preparing'){
      result = await  updateReady(req , no);
   }
    else{
      result = await updatePickupTime(req , no);
    }
  

    res.status(200).json({
      success: true,
      message: "Get Check In List successfully",
      data: result,
    });
    broadcastToTopics(
      ['collectScreen', 'getCollectScreenCtrl', 'pickCheckin', 'getPickCheckinCtrl', 'currentCheckin', 'getCurrentCheckInCtrl'],
      { type: 'refresh', source: 'pickStandby' }
    );
  } catch (error) {
    next(error);
  }
  
};

const getPickUpListNow = async (req, res, next) => {

  try {

    const result = await getPickUpList(req );

    res.status(200).json({
      success: true,
      message: "Get Check In List successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const getCheckInListCrtl2 = async (req, res, next) => {

  const { type  } = req.body;

  try {

    const result = await getCheckInList2(req , type);

    res.status(200).json({
      success: true,
      message: "Get Check In List successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const getStandbyListCtrl = async (req, res, next) => {

  try {

    const result = await getStandbyList(req );

    res.status(200).json({
      success: true,
      message: "Get Check In List successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const getCurrentCheckInCtrl = async (req, res, next) => {

  try {

    const result = await getCurrentCheckin(req );

    res.status(200).json({
      success: true,
      message: "Get Check In List successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const updatecheckInTask = async (req, res, next) => {

  const {  no , bay_id} = req.body;

  try {
      
      const checkNumber = await checkCheckinNumber(req, bay_id );
  
      if (checkNumber.total >= 2) {
        return res.status(400).json({
          success: false,
          message: "This Bay is full"
        });
      }


    // checkType


    const result = await updateCheckInNew(req, no , bay_id );

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

const updatecheckInTaskStaff = async (req, res, next) => {

  const {  no , bay_id} = req.body;

  try {

      await insertCheckInStaff(req, result.no, staff.staff_id , staff.type);
 

    res.status(200).json({
      success: true,
      message: "Check In successfully",
      insertedCount: result.rowCount
    });
  } catch (error) {
    next(error);
  }
  
};

const getCollectScreenCtrl = async (req, res, next) => {

  try {
  
    const result = await getCollectScreen(req );

    res.status(200).json({
      success: true,
      message: "Check In successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
  
};

const getBayCurrentCheckinCtrl = async (req, res, next) => {

  const {  bayname } = req.body;

  console.log(bayname)
  try {
  
    const result = await getBayCurrentCheckin(req , bayname);

    res.status(200).json({
      success: true,
      message: "Check In successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
  
};

const getTaskDetail = async (req, res, next) => {

  const {  masterlist_no , type } = req.body;

  try {
  
    const masterData = await searchMasterlistByno(req , masterlist_no);
    const item = await getTaskbyNoandType(req , masterlist_no , type);
    const checkin = await getCheckinByNoandType(req , masterlist_no , type);

  
    res.status(200).json({
      success: true,
      message: "Check In successfully",
      masterData: masterData,
      item : item,
      checkin : checkin
    });
  } catch (error) {
    next(error);
  }
  
};

const getmasterDetail2 = async (req, res, next) => {

  const {  masterlist_no  } = req.body;

  try {
  
    const masterData = await searchMasterlistByno(req , masterlist_no);
    const item = await getTaskbyNo(req , masterlist_no );
    const checkinfitment = await getCheckinByNo(req , masterlist_no );

  
    res.status(200).json({
      success: true,
      message: "Check In successfully",
      masterData: masterData,
      item : item,
      checkin : checkinfitment
    });
  } catch (error) {
    next(error);
  }
  
};

const getStaffDetail = async (req, res, next) => {
  console.log(req.body)
  try {
    const { month , staff_id} = req.body;   // "2025-11"

    if (!month) {
      return res.status(400).json({
        success: false,
        message: "month is required (format: YYYY-MM)"
      });
    }

    // Convert to first day of month
    const startDate = `${month}-01`;               // "2025-11-01"

    const task = await getStaffTaskList(req , startDate , staff_id);
    const staff = await getStaffById(req , staff_id);

    // const sql = `
    //   SELECT 
    //       c.no AS checkin_id,
    //       c.checkin_time
    //   FROM checkin c
    //   WHERE c.checkin_time >= $1
    //   AND c.checkin_time < ($1::date + INTERVAL '1 month')
    //   ORDER BY c.checkin_time ASC;
    // `;

    // const result = await db.query(sql, [startDate]);

    res.status(200).json({
      success: true,
      message: "Check In successfully",
      task: task,
      staff : staff
    });

  } catch (error) {
    next(error);
  }
};

const standbytoCheckIn = async (req, res, next) => {
  try {
    const { bay_id , checkin_id } = req.body;

    const deletestafffirst = await deleteCheckStaff(req , checkin_id);

    const bayStaff = await selectBayStaff(req, bay_id);

    for (const staff of bayStaff) {
      await insertCheckInStaff(req, checkin_id, staff.staff_id , staff.type);
    }

    const updatecheck = await updateCheckInNew(req, checkin_id, bay_id);

    
    res.status(200).json({
      success: true,
      message: "Check In successfully",
      
    });

  } catch (error) {
    next(error);
  }
};

const getPickCheckinCtrl = async (req, res, next) => {
  try {

    const result = await getPickCheckin(req );

    res.status(200).json({
      success: true,
      message: "Check In successfully",
      data : result
      
    });

  } catch (error) {
    next(error);
  }
};

const getstandbyHistory = async (req, res, next) => {
  try {

    const today = new Date().toISOString().slice(0, 10);
    const date_from = req.query.date_from || today;
    const date_to = req.query.date_to || req.query.date_from || today;

    const result = await standbyHistory(req, date_from, date_to);

    res.status(200).json({
      success: true,
      message: "Check In successfully",
      data : result
      
    });

  } catch (error) {
    next(error);
  }
};

const cancelMasterlistRangeCtrl = async (req, res, next) => {
  const { date, seq_from, seq_to, remark } = req.body;

  const seqFromNum = Number(seq_from);
  const seqToNum = Number(seq_to);

  if (!date || Number.isNaN(seqFromNum) || Number.isNaN(seqToNum)) {
    return res.status(400).json({
      success: false,
      message: 'date, seq_from, and seq_to are required'
    });
  }

  try {
    const result = await cancelMasterlistByRange(req, date, seqFromNum, seqToNum, remark || null, new Date());
    res.status(200).json({
      success: true,
      message: 'Masterlist cancelled successfully',
      count: result.length
    });
  } catch (error) {
    next(error);
  }
};

const inactiveMasterCtrl = async (req, res, next) => {

  const { status , cancel_remark  , no} = req.body;

  try {

    const result = await inactiveMaster(req , status , cancel_remark  , no );

    res.status(200).json({
      success: true,
      message: "Check In successfully",
      data : result
      
    });

  } catch (error) {
    next(error);
  }
};
// inactiveMaster

module.exports = {
  insertMasterlistWithAccessories,
  checkInTask,
  checkOutTask,
  manualCheckin,
  getCheckInListCrtl,
  getMasterListCtrl,
  getMasterBacklogCountCtrl,
  getTasksBacklogCountCtrl,
  getTasksStatusNullCountCtrl,
  getDashboardStatsCtrl,
  getMasterDetail,
  taskOffset,
  getTasksListCtrl,
  getTasksListCtrl2,
  getTasksReportCtrl,
  getAchievementListCtrl,
  getMasterListCtrl2,
  getHourlyCompletedStatsCtrl,
  deleteCheckinStaffCtrl,
  getStandyListToday,
  pickStandby,
  getPickUpListNow,
  getCheckInListCrtl2,
  checkRemark,
  getStandbyListCtrl,
  updatecheckInTask,
  getCollectScreenCtrl,
  getCurrentCheckInCtrl,
  getBayCurrentCheckinCtrl,
  getTaskDetail,
  getmasterDetail2,
  getStaffDetail,
  standbytoCheckIn,
  getPickCheckinCtrl,
  getstandbyHistory,
  getLastOpenCafiDateCtrl,
  cancelMasterlistRangeCtrl,
  inactiveMasterCtrl,
  addCheckinStaffCtrl
};
