const { listCases, lookupVehicles, getCase, createCase, submitCheck } = require('../models/caLineCheckModel');
const { uploadCaPhoto } = require('../../../../utils/caPhoto');

const respond = (work) => async (req, res, next) => {
  try {
    const data = await work(req);
    if (data === null) return res.status(404).json({ success: false, message: 'CA case not found' });
    res.status(200).json({ success: true, data });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    next(error);
  }
};

const cases = respond((req) => listCases(req, req.query));
const vehicles = respond((req) => lookupVehicles(req, req.query.fitment_id));
const detail = respond((req) => getCase(req, req.params.caseId));

const created = (work) => async (req, res, next) => {
  try { res.status(201).json({ success: true, data: await work(req) }); }
  catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    next(error);
  }
};
const create = created((req) => createCase(req, req.body || {}));
const submit = created((req) => submitCheck(req, req.params.caseId, req.body || {}));

const photo = async (req, res) => {
  try {
    const data = await uploadCaPhoto({ buffer: req.body, contentType: req.get('Content-Type')?.split(';')[0], draftKey: req.params.draftKey, userId: req.user.id });
    res.status(201).json({ success: true, data });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ success: false, message: error.message });
    console.error('[CA photo]', error.message);
    res.status(502).json({ success: false, message: 'Photo could not be saved. Please try again.' });
  }
};

module.exports = { cases, vehicles, detail, create, submit, photo };
