const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const {
  updateAccessoriesModel,
  insertAccessoriesModel,
  updateAccessoryByNO,
  getNewAccessory,
  findAccessory,
  getNewAccessoryByNo,
  getAccessoryGroup,
  getAccessoriesList,
  getAccessoriesByModel,
  updateAccessories2Model
} = require('../models/accessoriesModel');

require('dotenv').config();

const updateAccessories = async (req, res, next) => {
  const { updates } = req.body;
  // `updates` should be an array of objects with { no, model_code, model_description, accessory_type, accessory_code, price, duration, type }

  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({
      success: false,
      message: "No updates provided"
    });
  }

  try {
    const result = await updateAccessoriesModel(req, updates);

    res.status(200).json({
      success: true,
      message: "Accessories updated successfully",
      updatedCount: result.rowCount
    });
  } catch (error) {
    next(error);
  }
};

const updateAccessories2 = async (req, res, next) => {

  const updates = req.body; // expect array of objects

  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({ message: "No updates provided" });
  }

  try {
    const results = await updateAccessories2Model(req, updates);
    res.json({ success: true, updated: results });
  } catch (err) {
    console.error("Update failed:", err);
    res.status(500).json({ message: "Update failed", error: err.message });
  }

}

const insertAccessories = async (req, res, next) => {
  const { accessories } = req.body;

  console.log('run here if not die')
 console.log(accessories.length)

  if (!Array.isArray(accessories) || accessories.length === 0) {
    return res.status(400).json({
      success: false,
      message: "No accessories provided"
    });
  }


  try {

    const result = await insertAccessoriesModel(req, accessories);

    res.status(200).json({
      success: true,
      message: "Accessories inserted successfully",
      insertedCount: result.rowCount,
      data: result.rows
    });
  } catch (error) {
    next(error);
  } finally {

  }
};

const updateAccessory = async (req, res, next) => {

  const {
    price,
    duration,
    type,
    full_name,
    short_name,
    no,
    task_item_scope,
    update_task_items = false,
    task_item_from_date = null
  } = req.body;

  const allowedTaskItemScopes = new Set(['library', 'all', 'from_date']);
  const taskItemScope = task_item_scope === undefined
    ? (update_task_items === true ? 'from_date' : 'library')
    : task_item_scope;

  if (!no) {
    return res.status(400).json({ success: false, message: 'Accessory no is required' });
  }
  if (!Number.isFinite(Number(price)) || Number(price) < 0) {
    return res.status(400).json({ success: false, message: 'Price must be a non-negative number' });
  }
  if (!Number.isFinite(Number(duration)) || Number(duration) < 0) {
    return res.status(400).json({ success: false, message: 'Duration must be a non-negative number' });
  }
  if (!['FITMENT', 'HOIST', 'EXCLUDED'].includes(type)) {
    return res.status(400).json({ success: false, message: 'Type must be FITMENT, HOIST, or EXCLUDED' });
  }
  if (!allowedTaskItemScopes.has(taskItemScope)) {
    return res.status(400).json({ success: false, message: 'task_item_scope must be library, all, or from_date' });
  }
  if (taskItemScope === 'from_date' && !/^\d{4}-\d{2}-\d{2}$/.test(String(task_item_from_date || ''))) {
    return res.status(400).json({ success: false, message: 'task_item_from_date is required in YYYY-MM-DD format for from_date scope' });
  }

  try {

    const result = await updateAccessoryByNO(req, price, duration, type, full_name, short_name, no, {
      taskItemScope,
      taskItemFromDate: task_item_from_date
    });

    res.status(200).json({
      success: true,
      message: "Accessory updated successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const getNewAccessoryList = async (req, res, next) => {

  try {

    const result = await getNewAccessory(req);

    res.status(200).json({
      success: true,
      message: "Check Out successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const getAccessory = async (req, res, next) => {

  const {  no  } = req.body;
  console.log(no)
  try {

    const result = await getNewAccessoryByNo(req, no );

    res.status(200).json({
      success: true,
      message: "Check Out successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const insertAccessories2 = async (req, res, next) => {
  const updates = req.body; // expect array of objects

  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({ message: "No updates provided" });
  }

  const client = await req.app.get('pool');

  try {

    const results = [];

    for (const u of updates) {
      console.log(u)
      const { model_code ,model , model_description, accessory_type, accessory_code , full_name , type , short_name , price , duration } = u;

      const query = `
        INSERT INTO accessories2 (model_code ,model , model_description, accessory_type, accessory_code , full_name , type , short_name , price , duration ) VALUES 
        ( $1 ,$2 , $3, $4, $5 , $6 , $7, $8, $9, $10) RETURNING *
      `;

      const values = [model_code ,model , model_description, accessory_type, accessory_code , full_name , type , short_name , price , duration ];
      const result = await client.query(query, values);
      results.push(result.rows[0]);
    }
    res.json({ success: true, updated: results });
  } catch (err) {

    console.error("Insert failed:", err);
    res.status(500).json({ message: "Update failed", error: err.message });
  } finally {

  }
}

const getAccessoryGroupCtrl = async (req, res, next) => {

  try {

    const result = await getAccessoryGroup(req );

    res.status(200).json({
      success: true,
      message: "Check Out successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const getAccessoriesListCtrl = async (req, res, next) => {
  const { limit = 10, offset = 0, search = '' } = req.body || {};

  try {
    const result = await getAccessoriesList(req, { limit, offset, search });

    res.status(200).json({
      success: true,
      message: "Accessories fetched successfully",
      data: result.rows,
      total: result.total,
      limit: result.limit,
      offset: result.offset
    });
  } catch (error) {
    next(error);
  }
};

const getAccessoriesByModelCtrl = async (req, res, next) => {
  const { model_code, model_description } = req.body;

  console.log()

  try {
    const result = await getAccessoriesByModel(req, model_code, model_description);

    res.status(200).json({
      success: true,
      message: "Accessories fetched successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};
// getAccessoryGroup

module.exports = {
  updateAccessories,
  insertAccessories,
  updateAccessory,
  getNewAccessoryList,
  getAccessory,
  updateAccessories2,
  insertAccessories2,
  getAccessoryGroupCtrl,
  getAccessoriesListCtrl,
  getAccessoriesByModelCtrl
};
