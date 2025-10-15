const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('pg');

const {
  updateAccessoriesModel,
  insertAccessoriesModel,
  updateAccessoryByNO,
  getNewAccessory,
  findAccessory,
  getNewAccessoryByNo
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

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const results = [];

    for (const u of updates) {
      console.log(u)
      const { price, duration, type, full_name, short_name, no } = u;

      const query = `
        UPDATE accessories 
        SET price = $1, duration = $2, type = $3, full_name = $4, short_name = $5
        WHERE no = $6 
        RETURNING *;
      `;

      const values = [price, duration, type, full_name, short_name, no];
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

module.exports = {
  updateAccessories,
  insertAccessories,
  updateAccessory,
  getNewAccessoryList,
  getAccessory,
  updateAccessories2,
  insertAccessories2
};
