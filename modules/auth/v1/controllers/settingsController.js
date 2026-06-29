const {
  getSpecialCarModelCodes,
  updateSpecialCarModelCodes
} = require('../models/tasksModel');

const getSpecialCarSettingsCtrl = async (req, res, next) => {
  try {
    const result = await getSpecialCarModelCodes(req);

    res.status(200).json({
      success: true,
      message: 'Special car settings fetched successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const updateSpecialCarSettingsCtrl = async (req, res, next) => {
  const { special_car } = req.body;

  if (!Array.isArray(special_car)) {
    return res.status(400).json({
      success: false,
      message: 'special_car must be an array'
    });
  }

  try {
    const normalized = Array.from(
      new Set(
        special_car
          .map((item) => String(item || '').trim().toUpperCase())
          .filter(Boolean)
      )
    );

    const result = await updateSpecialCarModelCodes(req, normalized);

    res.status(200).json({
      success: true,
      message: 'Special car settings updated successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSpecialCarSettingsCtrl,
  updateSpecialCarSettingsCtrl
};
