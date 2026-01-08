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

  const {   price, duration, type, full_name , short_name , no  } = req.body;

  try {

    const result = await updateAccessoryByNO(req,  price, duration, type, full_name , short_name , no );

    res.status(200).json({
      success: true,
      message: "Check Out successfully",
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
  getAccessoriesByModelCtrl
};
