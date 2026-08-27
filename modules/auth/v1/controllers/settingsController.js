const {
  getSpecialCarModelCodes,
  getSpecialCarModels,
  updateSpecialCarModelCodes
} = require('../models/tasksModel');
const {
  getAndonVisibleBayIds,
  updateAndonVisibleBayIds
} = require('../models/andonVisibilityModel');
const { broadcastToTopic } = require('../../../realtime/v1/config/websocketConfig');

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

const getSpecialCarModelsCtrl = async (req, res, next) => {
  try {
    const result = await getSpecialCarModels(req);

    res.status(200).json({
      success: true,
      message: 'Special car models fetched successfully',
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

const getAndonVisibilitySettingsCtrl = async (req, res, next) => {
  try {
    const result = await getAndonVisibleBayIds(req);
    res.status(200).json({
      success: true,
      message: 'Andon visibility settings fetched successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const updateAndonVisibilitySettingsCtrl = async (req, res, next) => {
  const { visible_bay_ids: visibleBayIds } = req.body;

  if (visibleBayIds !== null && (!Array.isArray(visibleBayIds) || visibleBayIds.some((bayId) => typeof bayId !== 'string'))) {
    return res.status(400).json({
      success: false,
      message: 'visible_bay_ids must be an array of bay IDs or null'
    });
  }

  const normalizedBayIds = visibleBayIds === null
    ? null
    : Array.from(new Set(visibleBayIds.map((bayId) => bayId.trim()).filter(Boolean)));

  try {
    const result = await updateAndonVisibleBayIds(req, normalizedBayIds);
    broadcastToTopic('andonVisibility', { visibleBayIds: result.visible_bay_ids });

    res.status(200).json({
      success: true,
      message: 'Andon visibility settings updated successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSpecialCarSettingsCtrl,
  getSpecialCarModelsCtrl,
  updateSpecialCarSettingsCtrl,
  getAndonVisibilitySettingsCtrl,
  updateAndonVisibilitySettingsCtrl
};
