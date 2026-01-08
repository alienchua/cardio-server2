const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const {
  getAdminByEmail,
  getAdminByUsername,
  getAdminByPhone,
  insertAdmin,
  getAdminById,
  getAdmins,
  updateAdmin
} = require('../models/adminsModel');

require('dotenv').config();

const createAdmin = async (req, res, next) => {
  const { username, email, phone, password, role = 'admin' } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: 'Username and password are required'
    });
  }

  try {
    const [existingEmail, existingUsername, existingPhone] = await Promise.all([
      email ? getAdminByEmail(req, email) : null,
      getAdminByUsername(req, username),
      phone ? getAdminByPhone(req, phone) : null
    ]);

    if (existingUsername) {
      return res.status(400).json({
        success: false,
        message: 'Username already exists'
      });
    }
    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists'
      });
    }
    if (existingPhone) {
      return res.status(400).json({
        success: false,
        message: 'Phone already exists'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = await insertAdmin(req, { username, email, phone, hashedPassword, role });

    res.status(201).json({
      success: true,
      message: 'Admin created successfully',
      data: admin
    });
  } catch (error) {
    next(error);
  }
};

const getAdminWithId = async (req, res, next) => {
  try {
    const { id } = req.params;
    const admin = await getAdminById(req, id);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }
    res.status(200).json({
      success: true,
      data: admin
    });
  } catch (error) {
    next(error);
  }
};

const updateAdminById = async (req, res, next) => {
  try {
    const { id, username, email, phone, role } = req.body;

    if (!id) {
      return res.status(400).json({ success: false, message: 'Admin id is required' });
    }
    if (!username) {
      return res.status(400).json({ success: false, message: 'Username is required' });
    }

    const existing = await getAdminById(req, id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    const [existingEmail, existingUsername, existingPhone] = await Promise.all([
      email ? getAdminByEmail(req, email) : null,
      getAdminByUsername(req, username),
      phone ? getAdminByPhone(req, phone) : null
    ]);

    if (existingUsername && existingUsername.id !== Number(id)) {
      return res.status(400).json({ success: false, message: 'Username already exists' });
    }
    if (existingEmail && existingEmail.id !== Number(id)) {
      return res.status(400).json({ success: false, message: 'Email already exists' });
    }
    if (existingPhone && existingPhone.id !== Number(id)) {
      return res.status(400).json({ success: false, message: 'Phone already exists' });
    }

    const updated = await updateAdmin(req, {
      id,
      username,
      email,
      phone,
      role: role || existing.role
    });

    res.status(200).json({
      success: true,
      message: 'Admin updated successfully',
      data: updated
    });
  } catch (error) {
    next(error);
  }
};

const adminLogin = async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email and password are required'
    });
  }

  try {
    const admin = await getAdminByEmail(req, email);
    if (!admin) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const payload = { id: admin.id, role: admin.role || 'admin', type: 'admin' };
    const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        admin: {
          id: admin.id,
          username: admin.username,
          email: admin.email,
          phone: admin.phone,
          role: admin.role
        },
        accessToken,
        refreshToken
      }
    });
  } catch (error) {
    next(error);
  }
};

const getAddAdmin = async (req, res, next) => {
  try {
    const admins = await getAdmins(req);
    res.status(200).json({
      success: true,
      data: admins
    });
  } catch (error) {
    next(error);
  }
};

const getCurrentAdmin = async (req, res, next) => {
  try {
    const adminId = req.user?.id;
    if (!adminId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const admin = await getAdminById(req, adminId);
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }
    res.status(200).json({
      success: true,
      data: {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        phone: admin.phone,
        role: admin.role,
        created_at: admin.created_at
      }
    });
  } catch (error) {
    next(error);
  }
};



module.exports = {
  createAdmin,
  adminLogin,
  getAdminWithId,
  updateAdminById,
  getAddAdmin,
  getCurrentAdmin
};
