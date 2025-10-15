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
  updateAccessories,
  insertAccessories ,
  updateAccessory,
  getNewAccessoryList,
  getAccessory,
  updateAccessories2,
  insertAccessories2} = require('../controllers/accessoriesController');

const { 
  insertStaffs ,
  getStaffList,
  updateStaffBy
} = require('../controllers/staffsController');
const { 
  getBayListByType } = require('../controllers/bayController');
const { 
  createInstallment,
  getInstallmentCtrl ,
  getSalaryResultByMonth} = require('../controllers/salaryController');

const { 
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
  deleteCheckinStaffCtrl} = require('../controllers/tasksController');
  
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
router.post('/refresh-token', errorFormatter, refreshAccessToken);
router.post('/logout', auth, logout);
router.post('/add-to-blacklist', sanitizeInputs, [
  body('token').exists().withMessage('Token is required')
], errorFormatter, addToBlacklist);
router.get('/dashboard', auth,  roleMiddleware('admin'),errorFormatter,responseFormatter, dashboard);
router.post('/getUser', getUser);

// staffs
router.post('/insertStaffs', insertStaffs);
router.get('/getStaffList', getStaffList);
router.post('/getSalaryResultByMonth', getSalaryResultByMonth);
router.post('/updateStaffBy', updateStaffBy);



// // Accessories
router.post('/updateAccessories', updateAccessories);
router.post('/insertAccessories', insertAccessories);
router.post('/updateAccessory', updateAccessory);
router.post('/getNewAccessoryList', getNewAccessoryList);
router.post('/getAccessory', getAccessory);
router.post('/updateAccessories2', updateAccessories2);
router.post('/insertAccessories2', insertAccessories2);


//MasterList
router.post('/insertMasterlistWithAccessories', insertMasterlistWithAccessories);

// Task
router.post('/checkInTask', checkInTask);
router.post('/checkOutTask', checkOutTask);
router.get('/getCheckInListCrtl', getCheckInListCrtl);
router.get('/getMasterListCtrl', getMasterListCtrl);
router.post('/getMasterDetail', getMasterDetail);
router.post('/taskOffset', taskOffset);
router.get('/getTasksListCtrl', getTasksListCtrl);
router.post('/getTasksListCtrl2', getTasksListCtrl2);
router.post('/getMasterListCtrl2', getMasterListCtrl2);
router.post('/deleteCheckinStaffCtrl', deleteCheckinStaffCtrl);

router.post('/getBayListByType', getBayListByType);
// router.post('/getBayListByType', getBayListByType);

// installment
router.post('/createInstallment', createInstallment);
router.get('/getInstallmentCtrl', getInstallmentCtrl);


module.exports = router;






