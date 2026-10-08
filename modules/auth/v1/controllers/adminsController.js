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

const ACCESS_TOKEN_EXPIRES_IN = '7d';

const createAdmin = async (req, res, next) => {
  const { username, email, phone, password, role = 'admin', is_active = true } = req.body;

  if (String(req.user?.role || '').toLowerCase() === 'supervisor' && role !== 'qg') {
    return res.status(403).json({ success: false, message: 'Supervisors can only create QG accounts' });
  }

  if (typeof is_active !== 'boolean') {
    return res.status(400).json({ success: false, message: 'Status must be active or inactive' });
  }

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
    const admin = await insertAdmin(req, { username, email, phone, hashedPassword, role, is_active });

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
    const { id, username, email, phone, role, password, is_active } = req.body;

    if (is_active !== undefined && typeof is_active !== 'boolean') {
      return res.status(400).json({ success: false, message: 'Status must be active or inactive' });
    }
    if (is_active === false && String(req.user?.id) === String(id) && req.user?.type === 'admin') {
      return res.status(400).json({ success: false, message: 'You cannot deactivate your own account' });
    }
    if (!id) {
      return res.status(400).json({ success: false, message: 'Admin id is required' });
    }
    if (!username) {
      return res.status(400).json({ success: false, message: 'Username is required' });
    }
    if (password && String(req.user?.role || '').toLowerCase() !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Only superadmin can change password'
      });
    }
    if (password && String(password).length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long'
      });
    }

    const existing = await getAdminById(req, id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    if (String(req.user?.role || '').toLowerCase() === 'supervisor' &&
        (['admin', 'superadmin', 'supervisor'].includes(String(existing.role || '').toLowerCase()) ||
         (role || existing.role) !== 'qg')) {
      return res.status(403).json({ success: false, message: 'Supervisors can only assign QG to ordinary accounts or edit QG accounts' });
    }

    const [existingEmail, existingUsername, existingPhone] = await Promise.all([
      email ? getAdminByEmail(req, email) : null,
      getAdminByUsername(req, username),
      phone ? getAdminByPhone(req, phone) : null
    ]);

    if (existingUsername && String(existingUsername.id) !== String(id)) {
      return res.status(400).json({ success: false, message: 'Username already exists' });
    }
    if (existingEmail && String(existingEmail.id) !== String(id)) {
      return res.status(400).json({ success: false, message: 'Email already exists' });
    }
    if (existingPhone && String(existingPhone.id) !== String(id)) {
      return res.status(400).json({ success: false, message: 'Phone already exists' });
    }

    const hashedPassword = password ? await bcrypt.hash(password, 10) : null;

    const updated = await updateAdmin(req, {
      id,
      username,
      email,
      phone,
      role: role || existing.role,
      hashedPassword,
      is_active
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

    if (admin.is_active === false) {
      return res.status(403).json({ success: false, message: 'Your admin account is inactive' });
    }

    const payload = { id: admin.id, role: admin.role || 'admin', type: 'admin' };
    const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES_IN });
    const refreshToken = jwt.sign(payload, process.env.JWT_SECRET);

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
