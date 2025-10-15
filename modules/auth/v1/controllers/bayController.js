
const {
  getBayCheckinListByStatus
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

module.exports = {
  getBayListByType
};
