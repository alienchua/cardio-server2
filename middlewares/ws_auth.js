const jwt = require('jsonwebtoken');
require('dotenv').config();

const auth = (info, callback) => {
  const url = new URL(info.req.url, `http://${info.req.headers.host}`);
  const token =
    info.req.headers['authorization']?.replace('Bearer ', '') ||
    url.searchParams.get('token');
  if (!token) {
    // Allow anonymous websocket (for public dashboards)
    info.req.user = null;
    return callback(null, true);
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    info.req.user = decoded; // Attach decoded user to the request
    callback(null, true);
  } catch (error) {
    callback(new Error('Invalid Token, Please Refresh'), false);
  }
};

module.exports = auth;
