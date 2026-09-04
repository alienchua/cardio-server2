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
  getCancelledCheckinList,
  getTasksStatusNullCount,
  getTasksAnalisys2,
  getAchievementList,
  getAchievementAnalysis,
  getHourlyCompletedStats,
  getCompletedTaskSummary,
  getDailyVehicleModelSummary,
  deleteCheckinStaff,
  getStandyList,
  getStockCheckList,
  updatePickup,
  getPickUpList,
  updatePickupTime,
  getCheckInList2,
  updateCheckInRemark,
  getStandbyList,
  updateCheckInNew,
  changeCheckinBayAndStaff,
  cancelCheckinWithArchive,
  getCheckINByNo,
  resetCheckinToStandby,
  updateReady,
  updateCheckingTime,
  getFitmentCurrentCheckin,
  updatePreparing,
  getCollectScreen,
  getCurrentCheckin,
  getBayCurrentCheckin,
  searchMasterlistByno,
  findMasterlistByChassisFitment,
  findMasterlistsByFitmentIds,
  updateMasterlistFromImport,
  deleteTaskItemsByMasterlist,
  deleteTaskOffsetsByMasterlist,
  cancelCheckinsByMasterlist,
  cancelMasterlistForReplacement,
  updateMasterlistAccessoryFields,
  findTaskItemByMasterAccessory,
  deleteMasterlistWithTaskItems,
  updateMasterlistRemark,
  findMasterByChassisSeq,
  findStaffNosByStaffIds,
  insertManualCheckIn,
  upsertManualTaskCheckin,
  getTaskbyNoandType,
  updateTaskItemPriceWithHistory,
  getTaskItemPriceHistory,
  getCheckinByNoandType,
  getCheckinByNo,
  getTaskbyNo,
  getStaffTaskList,
  getSpecialCarModelCodes,
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
  findAccessory,
  getNewAccessoryByNo
} = require('../models/accessoriesModel');
const {
  selectBayStaff,
  selectBayByName,
  getBayStaffDetailByBayId
} = require('../models/bayModel');
const {
  getStaffById
} = require('../models/staffsModel');
const { broadcastToTopic, broadcastToTopics } = require('../../../realtime/v1/config/websocketConfig');

require('dotenv').config();

const normalizeImportKey = (value) => String(value || '').trim().toLowerCase();
const normalizeDisplayValue = (value) => String(value || '').trim();

const summarizeMasterlistRow = (row) => ({
  no: row.no,
  row_number: row.row_number || null,
  chassis: row.chassis || '',
  seq: row.seq || '',
  fitment_id: row.fitment_id || '',
  model_code: row.model_code || '',
  model_description: row.model_description || '',
  accessories_full: row.accessories_full || '',
  task_item_count: Number(row.task_item_count || 0),
  checkin_count: Number(row.checkin_count || 0),
  task_offset_count: Number(row.task_offset_count || 0),
  accessories_count: Array.isArray(row.accessories) ? row.accessories.length : undefined
});

const linkMasterlistAccessories = async (req, masterlistId, accessories = [], client = null) => {
  for (const acc of accessories || []) {
    let accessoryRow = await findAccessory(req, acc, client);

    if (!accessoryRow) {
      const accessoryId = await insertAccessory(req, acc, client);
      accessoryRow = {
        no: accessoryId,
        price: 0,
        duration: null,
        type: null,
        short_name: null
      };
    }

    await insertTaskItem(req, {
      masterlist_id: masterlistId,
      accessories_id: accessoryRow.no,
      price: accessoryRow?.price || 0,
      duration: accessoryRow?.duration || null,
      type: accessoryRow?.type || null,
      short_name: accessoryRow?.short_name || null,
    }, client);
  }
};

const insertMasterlistItemWithAccessories = async (req, item, options = {}) => {
  const { client = null, replaceExistingFitment = false } = options;

  if (replaceExistingFitment) {
    const existingRows = await findMasterlistsByFitmentIds(req, [item.fitment_id]);
    const incomingChassis = normalizeImportKey(item.chassis);
    const matchingRows = existingRows.filter((row) => (
      normalizeImportKey(row.fitment_id) === normalizeImportKey(item.fitment_id) &&
      normalizeImportKey(row.chassis) !== incomingChassis
    ));

    if (matchingRows.length > 0) {
      const historyAction = item?.fitment_history_action === 'cancel' ? 'cancel' : 'keep';
      const primaryRow = matchingRows[0];
      const hasHistory = Number(primaryRow.checkin_count || 0) > 0 || Number(primaryRow.task_offset_count || 0) > 0;

      if (hasHistory && historyAction === 'cancel') {
        const remark = item?.fitment_history_remark || `Replaced by import for Fitment ID ${item.fitment_id}`;
        await cancelCheckinsByMasterlist(req, primaryRow.no, req.user?.id || 4, remark, client);
        await deleteTaskOffsetsByMasterlist(req, primaryRow.no, client);
        await deleteTaskItemsByMasterlist(req, primaryRow.no, client);
        await cancelMasterlistForReplacement(req, primaryRow.no, remark, client);
      } else {
        await updateMasterlistFromImport(req, primaryRow.no, item, client);
        await deleteTaskItemsByMasterlist(req, primaryRow.no, client);
        await linkMasterlistAccessories(req, primaryRow.no, item.accessories || [], client);
        return {
          id: primaryRow.no,
          operation: 'replaced'
        };
      }

      for (const existingRow of matchingRows.slice(1)) {
        await deleteMasterlistWithTaskItems(req, existingRow.no, client);
      }
    }
  }

  const masterlistResult = await insertMasterlist(req, item, client);
  const { id, operation } = masterlistResult;

  if (operation === 'inserted') {
    await linkMasterlistAccessories(req, id, item.accessories || [], client);
  }

  return masterlistResult;
};

const checkMasterlistFitmentConflicts = async (req, res, next) => {
  const masterlistArray = Array.isArray(req.body) ? req.body : req.body?.rows;

  if (!Array.isArray(masterlistArray)) {
    return res.status(400).json({
      success: false,
      message: 'Payload must be an array'
    });
  }

  try {
    const incomingByFitment = new Map();
    for (const item of masterlistArray) {
      const fitmentKey = normalizeImportKey(item.fitment_id);
      if (!fitmentKey) continue;

      const list = incomingByFitment.get(fitmentKey) || [];
      list.push(item);
      incomingByFitment.set(fitmentKey, list);
    }

    const existingRows = await findMasterlistsByFitmentIds(req, [...incomingByFitment.keys()]);
    const existingByFitment = new Map();
    for (const row of existingRows) {
      const fitmentKey = normalizeImportKey(row.fitment_id);
      const list = existingByFitment.get(fitmentKey) || [];
      list.push(row);
      existingByFitment.set(fitmentKey, list);
    }

    const conflicts = [];

    for (const [fitmentKey, incomingRows] of incomingByFitment.entries()) {
      const distinctIncomingChassis = [...new Set(incomingRows.map((row) => normalizeImportKey(row.chassis)).filter(Boolean))];
      const existingMatches = existingByFitment.get(fitmentKey) || [];
      const dbConflicts = existingMatches.filter((existing) => (
        incomingRows.some((incoming) => (
          normalizeImportKey(existing.chassis) !== normalizeImportKey(incoming.chassis)
        ))
      ));

      if (distinctIncomingChassis.length <= 1 && dbConflicts.length === 0) {
        continue;
      }

      const optionMap = new Map();
      dbConflicts.forEach((row) => {
        optionMap.set(`existing:${row.no}`, {
          choice_key: `existing:${row.no}`,
          source: 'existing',
          label: 'Keep existing database row',
          row: summarizeMasterlistRow(row)
        });
      });

      incomingRows.forEach((row) => {
        optionMap.set(`incoming:${row.row_number}`, {
          choice_key: `incoming:${row.row_number}`,
          source: 'incoming',
          label: 'Keep incoming Excel row',
          row: summarizeMasterlistRow(row)
        });
      });

      conflicts.push({
        fitment_id: normalizeDisplayValue(incomingRows[0]?.fitment_id || existingMatches[0]?.fitment_id),
        fitment_key: fitmentKey,
        reason: dbConflicts.length > 0
          ? 'Same Fitment ID already exists with a different chassis'
          : 'Same Fitment ID appears more than once in the import file with different chassis',
        options: [...optionMap.values()]
      });
    }

    res.status(200).json({
      success: true,
      data: {
        total_conflicts: conflicts.length,
        conflicts
      }
    });
  } catch (err) {
    console.error('[checkMasterlistFitmentConflicts] error', err);
    next(err);
  }
};


const insertMasterlistWithAccessories = async (req, res, next) => {
  const masterlistArray = req.body;

  if (!Array.isArray(masterlistArray)) {
    return res.status(400).json({
      success: false,
      message: 'Payload must be an array'
    });
  }

  const pool = req.app.get('pool');
  const client = await pool.connect();

  try {
    // console.log('[insertMasterlistWithAccessories] received', {
    //   count: Array.isArray(masterlistArray) ? masterlistArray.length : 0,
    //   sample: Array.isArray(masterlistArray) ? masterlistArray[0] : masterlistArray
    // });
    const limitedData = masterlistArray; // you can slice if testing only a few items
    await client.query('BEGIN');

    for (const item of limitedData) {
      await insertMasterlistItemWithAccessories(req, item, {
        client,
        replaceExistingFitment: item?.fitment_conflict_action === 'replace'
      });
    }

    await client.query('COMMIT');

    res.status(200).json({
      success: true,
      message: "Inserted/updated masterlist with accessories ✅"
    });

    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[insertMasterlistWithAccessories] error', err);
    next(err);
  } finally {
    client.release();
  }
};

const insertMasterlistWithAccessoriesResolved = async (req, res, next) => {
  const masterlistArray = req.body;

  if (!Array.isArray(masterlistArray)) {
    return res.status(400).json({
      success: false,
      message: 'Payload must be an array'
    });
  }

  const pool = req.app.get('pool');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const item of masterlistArray) {
      await insertMasterlistItemWithAccessories(req, item, {
        client,
        replaceExistingFitment: item?.fitment_conflict_action === 'replace'
      });
    }

    await client.query('COMMIT');

    res.status(200).json({
      success: true,
      message: 'Inserted/updated masterlist with resolved fitment conflicts'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[insertMasterlistWithAccessoriesResolved] error', err);
    next(err);
  } finally {
    client.release();
  }
};

const repairMasterlistAccessoriesCtrl = async (req, res, next) => {
  const masterlistArray = req.body;

  if (!Array.isArray(masterlistArray)) {
    return res.status(400).json({
      success: false,
      message: 'Payload must be an array'
    });
  }

  const hasEmptyValue = (value) => value === null || value === undefined || String(value).trim() === '';

  try {
    const summary = {
      total: masterlistArray.length,
      repaired_masterlists: [],
      skipped_not_found: [],
      skipped_no_accessories: [],
      updated_masterlist_count: 0,
      inserted_task_item_count: 0,
      existing_task_item_count: 0
    };

    for (const item of masterlistArray) {
      const master = await findMasterlistByChassisFitment(req, item.chassis, item.fitment_id);

      if (!master?.no) {
        summary.skipped_not_found.push({
          chassis: item.chassis,
          fitment_id: item.fitment_id
        });
        continue;
      }

      let wasUpdated = false;
      const needsAccessoryFieldRepair =
        hasEmptyValue(master.accessories_std) ||
        hasEmptyValue(master.accessories_otp) ||
        hasEmptyValue(master.accessories_full);

      if (needsAccessoryFieldRepair) {
        await updateMasterlistAccessoryFields(req, master.no, item);
        wasUpdated = true;
        summary.updated_masterlist_count += 1;
      }

      if (!Array.isArray(item.accessories) || item.accessories.length === 0) {
        summary.skipped_no_accessories.push({
          masterlist_id: master.no,
          chassis: item.chassis,
          fitment_id: item.fitment_id
        });
        if (wasUpdated) {
          summary.repaired_masterlists.push(master.no);
        }
        continue;
      }

      for (const acc of item.accessories) {
        let accessoryRow = await findAccessory(req, acc);

        if (!accessoryRow) {
          const accessoryId = await insertAccessory(req, acc);
          accessoryRow = await getNewAccessoryByNo(req, accessoryId);
        }

        if (!accessoryRow?.no) {
          continue;
        }

        const existingTaskItem = await findTaskItemByMasterAccessory(req, master.no, accessoryRow.no);
        if (existingTaskItem) {
          summary.existing_task_item_count += 1;
          continue;
        }

        await insertTaskItem(req, {
          masterlist_id: master.no,
          accessories_id: accessoryRow.no,
          price: accessoryRow.price || 0,
          duration: accessoryRow.duration || null,
          type: accessoryRow.type || null,
          short_name: accessoryRow.short_name || null
        });

        wasUpdated = true;
        summary.inserted_task_item_count += 1;
      }

      if (wasUpdated) {
        summary.repaired_masterlists.push(master.no);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Masterlist accessories repair completed successfully',
      data: summary
    });
  } catch (err) {
    console.error('[repairMasterlistAccessoriesCtrl] error', err);
    next(err);
  }
};

const checkInTask = async (req, res, next) => {

  const {  chassis, fitment , bay_id , type , status} = req.body;

  // console.log(chassis, fitment , bay_id , type , status)
  try {

    const serachMaster = await searchMasterlist(req, chassis, fitment);
    if (!serachMaster) {
      return res.status(400).json({
        success: false,
        message: "Masterlist not found"
      });
    }

    const fitmentModelCodes = new Set(await getSpecialCarModelCodes(req));

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

  // console.log('[manualCheckin] received payload count:', payload.length);

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

  // console.log('[manualCheckin] summary:', responseBody);

  res.status(errors.length ? 400 : 200).json(responseBody);
};

const checkRemark = async (req, res, next) => {

  const { masterlist_id , type , remark } = req.body;

  // console.log(masterlist_id , type , remark)

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

  const {  chassis , fitment_id , fitment_type, model , seq , bay, staff_id, backlog_only, date_from  ,date_to  , type, date_field, page, page_size } = req.body;

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
      bay,
      staff_id,
      backlog_only,
      fitment_type: fitment_type,
      date_from : date_from || today,
      date_to : date_to || date_from || today,
      type : type,
      date_field: date_field,
      limit: pageSizeNum,
      offset
    }

    const isCancelledTab = String(type || '').toUpperCase() === 'CANCELLED';
    const result = isCancelledTab
      ? await getCancelledCheckinList(req, data)
      : await getTasksList2(req , data);
    const analysis = isCancelledTab ? [] : await getTasksAnalisys2(req , data)

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

const getAchievementListCtrl = async (req, res, next) => {

  const { chassis, fitment_id, fitment_type, model, model_code, seq, 
    date_from, date_to, date_field, bay, page, page_size } = req.body;

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
    const dateFrom = String(req.query?.date_from || req.query?.date || new Date().toISOString().slice(0, 10)).trim();
    const dateTo = String(req.query?.date_to || req.query?.date || dateFrom).trim();
    const datePattern = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
    if (!datePattern.test(dateFrom) || !datePattern.test(dateTo) || dateFrom > dateTo) {
      return res.status(400).json({
        success: false,
        message: 'Use date=YYYY-MM-DD or a valid date_from/date_to range'
      });
    }
    const result = await getHourlyCompletedStats(req, dateFrom, dateTo);
    res.status(200).json({
      success: true,
      message: "Get hourly completed stats successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const getCompletedTaskSummaryCtrl = async (req, res, next) => {
  try {
    const scope = String(req.query?.scope || '').trim();
    const value = String(req.query?.value || '').trim();
    let startDate;
    let endDate;

    if (scope === 'month' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
      const [year, month] = value.split('-').map(Number);
      startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      endDate = month === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 1).padStart(2, '0')}-01`;
    } else if (scope === 'year' && /^\d{4}$/.test(value)) {
      startDate = `${value}-01-01`;
      endDate = `${Number(value) + 1}-01-01`;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Use scope=month with YYYY-MM or scope=year with YYYY'
      });
    }

    const result = await getCompletedTaskSummary(req, startDate, endDate);
    res.status(200).json({
      success: true,
      message: 'Get completed task summary successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const getDailyVehicleModelSummaryCtrl = async (req, res, next) => {
  try {
    const dateFrom = String(req.query?.date_from || req.query?.date || '').trim();
    const dateTo = String(req.query?.date_to || req.query?.date || dateFrom).trim();
    const datePattern = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
    if (!datePattern.test(dateFrom) || !datePattern.test(dateTo) || dateFrom > dateTo) {
      return res.status(400).json({
        success: false,
        message: 'Use date=YYYY-MM-DD or a valid date_from/date_to range'
      });
    }

    const result = await getDailyVehicleModelSummary(req, dateFrom, dateTo);
    res.status(200).json({
      success: true,
      message: 'Get daily vehicle model summary successfully',
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
  // console.log('Received request for getTasksStatusNullCountCtrl');
  try {
    const count = await getTasksStatusNullCount(req);

    res.status(200).json({
      success: true,
      message: "Get task count successfully",
      data:  count 
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

const getStockCheckListToday = async (req, res, next) => {

  const {  type  } = req.body;

  try {

    const result = await getStockCheckList(req , type);

    res.status(200).json({
      success: true,
      message: "Get Stock Check List successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const pickStandby = async (req, res, next) => {

  const {  no  , type  } = req.body;
  const role = String(req.user?.role || '').toLowerCase();

  // console.log(no , type)

  if (role === 'installer' && type !== 'Ready') {
    return res.status(403).json({
      success: false,
      message: 'Installer can only mark ready parts as collected'
    });
  }

  if (role === 'warehouse' && !['Pending', 'Preparing'].includes(type)) {
    return res.status(403).json({
      success: false,
      message: 'Warehouse can only mark vehicle in or ready to collect'
    });
  }

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

const pickStockCheck = async (req, res, next) => {

  const { no, type } = req.body;
  try {
    let result;

    if (type == 'Ready') {
      result = await updateCheckingTime(req, no);
    }
    else if (type == 'Pending') {
      result = await updatePreparing(req, no);
    }
    else if (type == 'Preparing') {
      result = await updateReady(req, no);
    }
    else {
      result = await updatePickupTime(req, no);
    }

    res.status(200).json({
      success: true,
      message: "Update Stock Check successfully",
      data: result,
    });
    broadcastToTopics(
      ['collectScreen', 'getCollectScreenCtrl', 'pickCheckin', 'getPickCheckinCtrl', 'currentCheckin', 'getCurrentCheckInCtrl'],
      { type: 'refresh', source: 'pickStockCheck' }
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

  // console.log(bayname)
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

const getBayStaffByNameCtrl = async (req, res, next) => {
  const { bay_name } = req.body;

  if (!bay_name || !String(bay_name).trim()) {
    return res.status(400).json({
      success: false,
      message: 'bay_name is required'
    });
  }

  try {
    const bay = await selectBayByName(req, String(bay_name).trim());

    if (!bay?.no) {
      return res.status(404).json({
        success: false,
        message: 'Bay not found'
      });
    }

    const staff = await getBayStaffDetailByBayId(req, bay.no);

    return res.status(200).json({
      success: true,
      message: 'Bay staff loaded successfully',
      data: {
        bay_id: bay.no,
        bay_name: bay.name,
        bay_type: bay.type,
        staff
      }
    });
  } catch (error) {
    next(error);
  }
};

const updateTaskItemPriceCtrl = async (req, res, next) => {
  const { task_item_id, price, remark, action_by } = req.body;

  try {
    const nextPrice = Number(price);
    if (!task_item_id || !Number.isFinite(nextPrice) || nextPrice < 0 || !remark || !String(remark).trim()) {
      return res.status(400).json({
        success: false,
        message: 'task_item_id, valid price, and remark are required'
      });
    }

    const result = await updateTaskItemPriceWithHistory(req, {
      task_item_id,
      price: Math.round(nextPrice),
      remark: String(remark).trim(),
      action_by: action_by || req.user?.id || null
    });

    res.status(200).json({
      success: true,
      message: 'Task item price updated successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const getTaskItemPriceHistoryCtrl = async (req, res, next) => {
  const { task_item_ids } = req.body;

  try {
    const result = await getTaskItemPriceHistory(req, Array.isArray(task_item_ids) ? task_item_ids : []);
    res.status(200).json({
      success: true,
      message: 'Get task item price history successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const createTaskDirectCheckinCtrl = async (req, res, next) => {
  const { masterlist_id, type, date, bay_name, staff_ids, remark } = req.body;

  if (!masterlist_id || !type || !date || !bay_name) {
    return res.status(400).json({
      success: false,
      message: 'masterlist_id, type, date, and bay_name are required'
    });
  }
  if (!remark || !String(remark).trim()) {
    return res.status(400).json({
      success: false,
      message: 'remark is required'
    });
  }

  try {
    const master = await searchMasterlistByno(req, masterlist_id);
    if (!master?.no) {
      return res.status(404).json({
        success: false,
        message: 'Masterlist not found'
      });
    }

    const existing = await searchCheckIN(req, master.no, type);
    const isStandbyRecord = existing?.no && String(existing?.status || '').trim().toLowerCase() === 'standby';

    if (existing?.no && !isStandbyRecord) {
      return res.status(400).json({
        success: false,
        message: 'This task already has a check-in record'
      });
    }

    const bay = await selectBayByName(req, String(bay_name).trim());
    if (!bay?.no) {
      return res.status(404).json({
        success: false,
        message: 'Bay not found'
      });
    }

    const nextStaffIds = Array.isArray(staff_ids)
      ? staff_ids
      : (await getBayStaffDetailByBayId(req, bay.no)).map((staff) => staff.no);

    const normalizedStaffIds = Array.from(
      new Set((nextStaffIds || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))
    );

    const normalizedBayName = String(bay?.name || bay_name || '').trim().toUpperCase();

    if (normalizedStaffIds.length === 0 && normalizedBayName !== 'E1') {
      return res.status(400).json({
        success: false,
        message: 'At least one staff must be selected'
      });
    }

    const selectedDateTime = `${String(date).trim()} 00:00:00`;
    const result = await upsertManualTaskCheckin(req, {
      existing_checkin_id: isStandbyRecord ? existing.no : null,
      masterlist_id: master.no,
      action_by: req.user?.id || 4,
      bay_id: bay.no,
      type,
      checkin_time: selectedDateTime,
      checkout_time: selectedDateTime,
      remark: String(remark).trim(),
      staff_ids: normalizedStaffIds
    });

    return res.status(200).json({
      success: true,
      message: 'Task checked in and checked out successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const resetCheckinToStandbyCtrl = async (req, res, next) => {
  const { masterlist_id, type } = req.body;

  if (!masterlist_id || !type) {
    return res.status(400).json({
      success: false,
      message: "masterlist_id and type are required"
    });
  }

  try {
    const checkinRows = await getCheckinByNoandType(req, masterlist_id, type);
    const checkin = Array.isArray(checkinRows) ? checkinRows[0] : checkinRows;

    if (!checkin || !checkin.checkin_id) {
      return res.status(404).json({
        success: false,
        message: "Check-in record not found"
      });
    }

    if (checkin.status !== 'Check-In') {
      return res.status(400).json({
        success: false,
        message: "Only Check-In tasks can be reset to Standby"
      });
    }

    const updated = await resetCheckinToStandby(req, checkin.checkin_id);

    return res.status(200).json({
      success: true,
      message: "Reset to Standby successfully",
      data: updated
    });
  } catch (error) {
    next(error);
  }
};

const changeTaskBayCtrl = async (req, res, next) => {
  const { masterlist_id, type, bay_name, staff_ids } = req.body;

  if (!masterlist_id || !type || !bay_name) {
    return res.status(400).json({
      success: false,
      message: 'masterlist_id, type, and bay_name are required'
    });
  }

  try {
    const checkinRows = await getCheckinByNoandType(req, masterlist_id, type);
    const checkin = Array.isArray(checkinRows) ? checkinRows[0] : checkinRows;

    if (!checkin?.checkin_id) {
      return res.status(404).json({
        success: false,
        message: 'Check-in record not found'
      });
    }

    const bay = await selectBayByName(req, String(bay_name).trim());
    if (!bay?.no) {
      return res.status(404).json({
        success: false,
        message: 'Bay not found'
      });
    }

    const nextStaffIds = Array.isArray(staff_ids)
      ? staff_ids
      : (await getBayStaffDetailByBayId(req, bay.no)).map((staff) => staff.no);

    const updated = await changeCheckinBayAndStaff(req, {
      checkin_id: checkin.checkin_id,
      bay_id: bay.no,
      staff_ids: nextStaffIds
    });

    return res.status(200).json({
      success: true,
      message: 'Task bay updated successfully',
      data: updated
    });
  } catch (error) {
    next(error);
  }
};

const cancelTaskCheckinCtrl = async (req, res, next) => {
  const { masterlist_id, type, remark } = req.body;

  if (!masterlist_id || !type || !remark || !String(remark).trim()) {
    return res.status(400).json({
      success: false,
      message: 'masterlist_id, type, and remark are required'
    });
  }

  try {
    const checkinRows = await getCheckinByNoandType(req, masterlist_id, type);
    const checkin = Array.isArray(checkinRows) ? checkinRows[0] : checkinRows;

    if (!checkin?.checkin_id) {
      return res.status(404).json({
        success: false,
        message: 'Check-in record not found'
      });
    }

    const result = await cancelCheckinWithArchive(req, {
      checkin_id: checkin.checkin_id,
      action_by: req.user?.id || 4,
      remark: String(remark).trim()
    });

    return res.status(200).json({
      success: true,
      message: 'Check-in cancelled successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const postwashTaskCtrl = async (req, res, next) => {
  const { masterlist_id, remark } = req.body;

  if (!masterlist_id || !remark || !String(remark).trim()) {
    return res.status(400).json({
      success: false,
      message: 'masterlist_id and remark are required'
    });
  }

  try {
    const master = await searchMasterlistByno(req, masterlist_id);

    if (!master?.no) {
      return res.status(404).json({
        success: false,
        message: 'Masterlist not found'
      });
    }

    const updated = await updateMasterlistRemark(req, master.no, String(remark).trim());

    return res.status(200).json({
      success: true,
      message: 'Postwash remark updated successfully',
      data: updated
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
  // console.log(req.body)
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
  insertMasterlistWithAccessoriesResolved,
  checkMasterlistFitmentConflicts,
  repairMasterlistAccessoriesCtrl,
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
  getAchievementListCtrl,
  getMasterListCtrl2,
  getHourlyCompletedStatsCtrl,
  getCompletedTaskSummaryCtrl,
  getDailyVehicleModelSummaryCtrl,
  deleteCheckinStaffCtrl,
  getStandyListToday,
  getStockCheckListToday,
  pickStandby,
  pickStockCheck,
  getPickUpListNow,
  getCheckInListCrtl2,
  checkRemark,
  getStandbyListCtrl,
  updatecheckInTask,
  getCollectScreenCtrl,
  getCurrentCheckInCtrl,
  getBayCurrentCheckinCtrl,
  getTaskDetail,
  updateTaskItemPriceCtrl,
  getTaskItemPriceHistoryCtrl,
  getBayStaffByNameCtrl,
  createTaskDirectCheckinCtrl,
  changeTaskBayCtrl,
  cancelTaskCheckinCtrl,
  postwashTaskCtrl,
  resetCheckinToStandbyCtrl,
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
