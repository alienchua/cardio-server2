const express = require('express');
const { body } = require('express-validator');
const { 
  register, 
  login, 
  refreshAccessToken, 
  dashboard, 
  logout,
  addToBlacklist  ,
  getUser} = require('../controllers/authController');

const { 
  createAdmin,
  adminLogin,
  getAdminWithId,
  updateAdminById,
  getAddAdmin,
  getCurrentAdmin
} = require('../controllers/adminsController');

const { 
  updateAccessories,
  insertAccessories ,
  updateAccessory,
  getNewAccessoryList,
  getAccessory,
  updateAccessories2,
  insertAccessories2,
  getAccessoryGroupCtrl,
  getAccessoriesByModelCtrl} = require('../controllers/accessoriesController');

const { 
  insertStaffs ,
  getStaffList,
  updateStaffBy,
  updateStaffBay,
  uploadStaffAttendance,
  createStaff
} = require('../controllers/staffsController');
const { 
  getBayListByType,
  getBayListCtrl,
  getStaffEmptyBayCtrl,
  removeStaff,
  clearBayStaffCtrl,
  insertStafftoBay,
  runBayResetCtrl,
  getBayCheckinListCtrl,
  getBayHistoryCtrl } = require('../controllers/bayController');
const { 
  createInstallment,
  getInstallmentCtrl ,
  getInstallmentByNoCtrl,
  getSalaryResultByMonth,
  getSalaryDetailByStaff,
  getSalaryVoucherDetail,
  getSalaryVoucherDetailByBay,
  setSettlement} = require('../controllers/salaryController');

const { 
  insertMasterlistWithAccessories,
  checkInTask,
  checkOutTask,
  getCheckInListCrtl,
  getCheckInListCrtl2,
  getMasterListCtrl,
  getMasterBacklogCountCtrl,
  getTasksBacklogCountCtrl,
  getTasksStatusNullCountCtrl,
  getDashboardStatsCtrl,
  getLastOpenCafiDateCtrl,
  getMasterDetail,
  taskOffset,
  getTasksListCtrl,
  getTasksListCtrl2,
  getAchievementListCtrl,
  getHourlyCompletedStatsCtrl,
  getMasterListCtrl2,
  deleteCheckinStaffCtrl,
  getStandyListToday,
  pickStandby,
  getPickUpListNow,
  checkRemark,
  getStandbyListCtrl,
  updatecheckInTask,
  getCurrentCheckInCtrl,
  getCollectScreenCtrl,
  getBayCurrentCheckinCtrl,
  getTaskDetail,
  getmasterDetail2,
  getStaffDetail,
  standbytoCheckIn,
  getPickCheckinCtrl,
  inactiveMasterCtrl,
  getstandbyHistory,
  cancelMasterlistRangeCtrl,
  manualCheckin,
  addCheckinStaffCtrl} = require('../controllers/tasksController');
  
const auth = require('../../../../middlewares/auth');
const errorFormatter = require('../../../../middlewares/errorFormatter');
const roleMiddleware = require('../../../../middlewares/roleMiddleware');
const sanitizeInputs = require('../../../../middlewares/sanitize');
const responseFormatter = require('../../../../middlewares/responseFormatter');
const router = express.Router();
const loginLimiter = require('../../../../middlewares/rateLimiter');
const preventbrute  = require('../../../../middlewares/bruteForceProtection');


const registerValidation = [
    body('username').notEmpty().withMessage('Username is required'),
    body('email').optional().isEmail().withMessage('Email must be valid'),
    body('phone').optional().isMobilePhone().withMessage('Phone number must be valid'),
    body('password').optional().isLength({ min: 8 }).withMessage('Password must be at least 8 characters long'),
    body('passcode').optional().isLength({ min: 6, max: 6 }).withMessage('Passcode must be 6 characters long'),
];

const loginValidation = [
  body('email').optional().isEmail().withMessage('Email must be valid'),
  body('password').optional().isLength({ min: 8 }).withMessage('Password must be at least 8 characters long'),
  body('phone').optional().isMobilePhone().withMessage('Phone number must be valid'),
  body('passcode').optional().isLength({ min: 6, max: 6 }).withMessage('Passcode must be 6 characters long')
];
router.post('/register',sanitizeInputs, registerValidation, errorFormatter, register);
router.post('/login',sanitizeInputs,loginValidation, preventbrute ('email'),preventbrute ('phone'),errorFormatter, login);
router.post('/adminLogin', sanitizeInputs, loginValidation, errorFormatter, adminLogin);
router.post('/refresh-token', errorFormatter, refreshAccessToken);
router.post('/logout', auth, logout);
router.get('/admin/me', auth, getCurrentAdmin);
router.post('/add-to-blacklist', sanitizeInputs, [
  body('token').exists().withMessage('Token is required')
], errorFormatter, addToBlacklist);
router.get('/dashboard', auth,  roleMiddleware('admin'),errorFormatter,responseFormatter, dashboard);
router.post('/getUser', getUser);
router.post('/createAdmin', createAdmin);
router.get('/getAdminWithId/:id', getAdminWithId);
router.post('/updateAdmin', updateAdminById);
router.get('/getAddAdmin', getAddAdmin);

// staffs
router.post('/insertStaffs', insertStaffs);
router.get('/getStaffList', getStaffList);
router.post('/getSalaryResultByMonth', getSalaryResultByMonth);
router.post('/updateStaffBy', updateStaffBy);
router.post('/getSalaryDetailByStaff', getSalaryDetailByStaff);
router.post('/getSalaryVoucherDetail', getSalaryVoucherDetail);
router.post('/getSalaryVoucherDetailByBay', getSalaryVoucherDetailByBay);
router.post('/updateStaffBay', updateStaffBay);
router.post('/setSettlement', setSettlement);
router.post('/uploadStaffAttendance', uploadStaffAttendance);
router.post('/createStaff', createStaff);



// // Accessories
router.post('/updateAccessories', updateAccessories);
router.post('/insertAccessories', insertAccessories);
router.post('/updateAccessory', updateAccessory);
router.post('/getNewAccessoryList', getNewAccessoryList);
router.post('/getAccessory', getAccessory);
router.post('/updateAccessories2', updateAccessories2);
router.post('/insertAccessories2', insertAccessories2);
router.get('/getAccessoryGroupCtrl', getAccessoryGroupCtrl);
router.post('/getAccessoriesByModel', getAccessoriesByModelCtrl);

//MasterList
router.post('/insertMasterlistWithAccessories', insertMasterlistWithAccessories);

// Task
router.post('/checkInTask', checkInTask);
router.post('/checkOutTask', checkOutTask);
router.get('/getCheckInListCrtl', getCheckInListCrtl);
router.post('/getCheckInListCrtl2', getCheckInListCrtl2);
router.get('/getMasterListCtrl', getMasterListCtrl);
router.get('/getMasterBacklogCount', getMasterBacklogCountCtrl);
router.get('/getTasksBacklogCount', getTasksBacklogCountCtrl);
router.get('/getLastOpenCafiDate', getLastOpenCafiDateCtrl);
router.get('/dashboardStats', getDashboardStatsCtrl);
router.post('/getMasterDetail', getMasterDetail);
router.post('/taskOffset', taskOffset);
router.get('/getTasksListCtrl', getTasksListCtrl);
router.post('/getTasksListCtrl2', getTasksListCtrl2);
router.get('/getTasksStatusNullCount', getTasksStatusNullCountCtrl);
router.post('/getAchievementListCtrl', getAchievementListCtrl);
router.get('/getHourlyCompletedStatsCtrl', getHourlyCompletedStatsCtrl);
router.post('/getMasterListCtrl2', getMasterListCtrl2);
router.post('/cancelMasterlistRange', cancelMasterlistRangeCtrl);
router.post('/deleteCheckinStaffCtrl', deleteCheckinStaffCtrl);
router.post('/pickStandby', pickStandby);
router.get('/getPickUpListNow', getPickUpListNow);
router.post('/checkRemark', checkRemark);
router.post('/getStandbyListCtrl', getStandbyListCtrl);
router.get('/getCollectScreenCtrl', getCollectScreenCtrl);
router.post('/getBayCurrentCheckinCtrl', getBayCurrentCheckinCtrl);
router.post('/getTaskDetail', getTaskDetail);
router.post('/getmasterDetail2', getmasterDetail2);
router.post('/getStaffDetail', getStaffDetail);
router.post('/standbytoCheckIn', standbytoCheckIn);
router.get('/getPickCheckinCtrl', getPickCheckinCtrl);
router.get('/getstandbyHistory', getstandbyHistory);
router.post('/inactiveMasterCtrl', inactiveMasterCtrl);
router.get('/getBayCheckinListCtrl', getBayCheckinListCtrl);
router.post('/getBayHistoryCtrl', getBayHistoryCtrl);
router.post('/manualCheckin', manualCheckin);
router.post('/addCheckinStaffCtrl', addCheckinStaffCtrl);

//bay
router.post('/getBayListByType', getBayListByType);
router.get('/getBayListCtrl', getBayListCtrl);
router.get('/getStaffEmptyBayCtrl', getStaffEmptyBayCtrl);
router.post('/removeStaff', removeStaff);
router.post('/clearBayStaff', clearBayStaffCtrl);
router.post('/insertStafftoBay', insertStafftoBay);
router.post('/runBayReset', runBayResetCtrl);



router.post('/getStandyListToday', getStandyListToday);
router.post('/updatecheckInTask', updatecheckInTask);
router.get('/getCurrentCheckInCtrl', getCurrentCheckInCtrl);

// installment
router.post('/createInstallment', createInstallment);
router.get('/getInstallmentCtrl', getInstallmentCtrl);
router.post('/getInstallmentByNo', getInstallmentByNoCtrl);


module.exports = router;
