const bcrypt = require('bcryptjs');
const { phone: phoneValidator } = require('phone');
const jwt = require('jsonwebtoken');
const {
  getUserByEmail,
  getUserByUsername,
  getRefreshToken,
  createUser,
  createAccessToken,
  createRefreshToken,
  deleteAccessToken,
  deleteRefreshToken,
  updateLastLogin,
  getUserByPhone,
  insertRole
} = require('../models/userModel');
require('dotenv').config();

const ACCESS_TOKEN_EXPIRES_IN = '7d';
const ACCESS_TOKEN_EXPIRES_MS = 7 * 24 * 60 * 60 * 1000;
const REFRESH_TOKEN_EXPIRES_AT = new Date('9999-12-31T23:59:59.999Z');

const generateToken = (user, expiresIn) => {
  const payload = { id: user.id, role: user.role || 'user' };
  if (user.type) payload.type = user.type;
  return expiresIn
    ? jwt.sign(payload, process.env.JWT_SECRET, { expiresIn })
    : jwt.sign(payload, process.env.JWT_SECRET);
};

const register = async (req, res, next) => {
  const { name, email, password , autho , position , status} = req.body;
  try {
    if (email) {
      const existingEmail = await getUserByEmail(req, email);
      if (existingEmail) {
        return res.status(400).json({
          success: false,
          message: 'Validation Error',
          errors: [{ field: 'email', message: 'Email already exists' }],
        });
      }
    }

    let hashedPassword;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    const user = await createUser(req, name, email , hashedPassword, position , status);

    for (const acc of item.accessories || []) {


    }
    // await insertRole

    console.log(user)
    const accessToken = generateToken(user, ACCESS_TOKEN_EXPIRES_IN);
    const refreshToken = generateToken(user);
    const createdAt = new Date();
    const accessTokenExpiresAt = new Date(createdAt.getTime() + ACCESS_TOKEN_EXPIRES_MS);
    const refreshTokenExpiresAt = REFRESH_TOKEN_EXPIRES_AT;

    await createAccessToken(req, user.id, accessToken, accessTokenExpiresAt);
    await createRefreshToken(req, user.id, refreshToken, refreshTokenExpiresAt);
    await updateLastLogin(req, user.id);
    // Set the refresh token in an HttpOnly, Secure cookie with SameSite=Lax


    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        accessToken,
        refreshToken,
        createdAt: createdAt.getTime(),
        accessTokenExpiresAt: accessTokenExpiresAt.getTime(),
        refreshTokenExpiresAt: refreshTokenExpiresAt.getTime()
      }
    });
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  const { email, phone, password, passcode, prefix } = req.body;
  try {
    let user;
    if (email) {
      user = await getUserByEmail(req, email);
      if (!user) {
        return res.status(400).json({
          success: false,
          message: 'Authentication Error',
          errors: [{ field: 'email', message: 'Invalid email or password' }],
        });
      }
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({
          success: false,
          message: 'Authentication Error',
          errors: [{ field: 'password', message: 'Invalid email or password' }],
        });
      }
    } else if (phone) {

      console.log(phone)
      const { isValid, phoneNumber } = await phoneValidator(`+(${prefix}) ${phone}`)
      console.log(phoneNumber)
      user = await getUserByPhone(req, phoneNumber || phone);
      console.log(user)
      if (!user) {
        return res.status(400).json({
          success: false,
          message: 'Authentication Error',
          errors: [{ field: 'phone', message: 'No such number' }],
        });
      }
      if (passcode !== user.passcode) {
        return res.status(400).json({
          success: false,
          message: 'Authentication Error',
          errors: [{ field: 'passcode', message: 'Invalid phone number or passcode' }],
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: 'Authentication Error',
        errors: [{ field: 'authentication', message: 'Email or phone number is required' }],
      });
    }
    const accessToken = generateToken(user, ACCESS_TOKEN_EXPIRES_IN);
    const refreshToken = generateToken(user);
    const createdAt = new Date();
    const accessTokenExpiresAt = new Date(createdAt.getTime() + ACCESS_TOKEN_EXPIRES_MS);
    const refreshTokenExpiresAt = REFRESH_TOKEN_EXPIRES_AT;

    await createAccessToken(req, user.id, accessToken, accessTokenExpiresAt);
    await createRefreshToken(req, user.id, refreshToken, refreshTokenExpiresAt);
    await updateLastLogin(req, user.id);
    // Set the refresh token in an HttpOnly, Secure cookie with SameSite=Lax

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        accessToken,
        refreshToken,
        createdAt: createdAt.getTime(),
        accessTokenExpiresAt: accessTokenExpiresAt.getTime(),
        refreshTokenExpiresAt: refreshTokenExpiresAt.getTime()

      }
    });
  } catch (error) {
    next(error);
  }
};



const refreshAccessToken = async (req, res, next) => {
  const { token } = req.body;
  try {

    if (!token) {
      console.warn('[auth] Refresh token failed: missing token');
      return res.status(401).json({
        success: false,
        message: 'Authentication Error',
        error: 'Invalid refresh token'
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      console.warn('[auth] Refresh token failed: invalid or expired JWT');
      return res.status(401).json({
        success: false,
        message: 'Authentication Error',
        error: 'Invalid or expired refresh token'
      });
    }

    console.log('[auth] Refresh token verified', {
      userId: decoded.id,
      role: decoded.role,
      type: decoded.type || 'user',
      refreshExpiresAt: decoded.exp ? new Date(decoded.exp * 1000).toISOString() : null
    });

    const storedRefreshToken = await getRefreshToken(req, token);
    if (!storedRefreshToken && decoded.type !== 'admin') {
      console.warn('[auth] Refresh token failed: token not found in database', {
        userId: decoded.id,
        role: decoded.role,
        type: decoded.type || 'user'
      });
      return res.status(401).json({
        success: false,
        message: 'Authentication Error',
        error: 'Refresh token not found'
      });
    }

    if (storedRefreshToken && new Date(storedRefreshToken.expires_at) < new Date()) {
      await deleteRefreshToken(req, token);
      console.warn('[auth] Refresh token failed: database token expired', {
        userId: storedRefreshToken.user_id,
        expiresAt: storedRefreshToken.expires_at
      });
      return res.status(401).json({
        success: false,
        message: 'Authentication Error',
        error: 'Refresh token expired'
      });
    }

    const user = { id: decoded.id || storedRefreshToken?.user_id, role: decoded.role, type: decoded.type };
    const accessToken = generateToken(user, ACCESS_TOKEN_EXPIRES_IN);
    const accessTokenExpiresAt = new Date(new Date().getTime() + ACCESS_TOKEN_EXPIRES_MS);

    if (decoded.type !== 'admin') {
      await createAccessToken(req, user.id, accessToken, accessTokenExpiresAt);
    }

    console.log('[auth] Access token refreshed successfully', {
      userId: user.id,
      role: user.role,
      type: user.type || 'user',
      accessExpiresAt: accessTokenExpiresAt.toISOString()
    });

    res.status(200).json({
      success: true,
      message: 'Access token refreshed',
      data: { accessToken, accessTokenExpiresAt: accessTokenExpiresAt.getTime() }
    });
  } catch (error) {
    next(error);
  }
};

const logout = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return res.status(400).json({
      success: false,
      message: 'No token provided'
    });
  }

  try {
    await deleteAccessToken(req, token);
    res.status(200).json({
      success: true,
      message: 'User logged out successfully'
    });
  } catch (error) {
    next(error);
  }
};

const addToBlacklist = async (req, res, next) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({
      success: false,
      message: 'No token provided'
    });
  }

  try {
    await req.app.get('pool').query('INSERT INTO token_blacklist (token) VALUES ($1)', [token]);
    redisClient.setex(token, 3600, 'blacklisted'); // Cache for 1 hour
    res.status(200).json({
      success: true,
      message: 'Token added to blacklist successfully'
    });
  } catch (error) {
    next(error);
  }
};


const dashboard = (req, res) => {
  res.send({
    "success": true,
    "message": "HelloWrold",
    "data": {
      "message": "hello World"
    }
  })
};

const getUser = async (req, res, next) => {
  const {email} = req.body

  try {
    // balance, type, order_id, payout_id, staff_id, amount
    let order = await getUserByEmail(req, email);
  
    res.status(200).json({
      success: true,
      message: 'update order success successful',
      data : order
    });

  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  refreshAccessToken,
  logout,
  dashboard,
  addToBlacklist,
  getUser
};
