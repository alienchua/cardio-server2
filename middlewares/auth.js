const jwt = require('jsonwebtoken');
require('dotenv').config();

const auth = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {


    return res.error('Access Token Error', 'No token, authorization denied', 401);
  }

  try {
    //too heavy
    // const blacklistedToken = await pool.query('SELECT * FROM token_blacklist WHERE token = $1', [token]);
    // if (blacklistedToken.rows.length > 0) {
    //   return res.error('Access Token Error', 'Blacklisted, authorization denied', 401);
    // }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type === 'admin') {
      const result = await req.app.get('pool').query('SELECT is_active FROM admins WHERE id = $1', [decoded.id]);
      if (!result.rows[0] || result.rows[0].is_active === false) {
        return res.error('Access denied', 'Admin account is inactive or unavailable', 403);
      }
    }
    req.user = decoded;
    console.log(decoded)
    next();
  } catch (error) {
    

    res.error(error.name||'Access Token Error', error.message||"Invalid Token, Please Refresh", 401);

  }
};





module.exports = auth;
