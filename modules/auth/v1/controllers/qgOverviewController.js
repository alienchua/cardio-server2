const { getOverview } = require('../models/qgOverviewModel');

const overview = async (req, res, next) => {
  try {
    res.status(200).json({ success: true, data: await getOverview(req, req.query || {}) });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ success: false, message: error.message });
    next(error);
  }
};

module.exports = { overview };
