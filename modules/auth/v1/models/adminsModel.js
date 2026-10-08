require('dotenv').config();

const getAdminByEmail = async (req, email) => {
  const result = await req.app.get('pool').query(
    'SELECT * FROM admins WHERE email = $1 LIMIT 1',
    [email]
  );
  return result.rows[0];
};

const getAdminByUsername = async (req, username) => {
  const result = await req.app.get('pool').query(
    'SELECT * FROM admins WHERE username = $1 LIMIT 1',
    [username]
  );
  return result.rows[0];
};

const getAdminByPhone = async (req, phone) => {
  const result = await req.app.get('pool').query(
    'SELECT * FROM admins WHERE phone = $1 LIMIT 1',
    [phone]
  );
  return result.rows[0];
};

const insertAdmin = async (req, { username, email, phone, hashedPassword, role, is_active = true }) => {
  const result = await req.app.get('pool').query(
    `INSERT INTO admins (username, email, phone, password, role, is_active)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, username, email, phone, role, is_active, created_at`,
    [username, email || null, phone || null, hashedPassword, role || 'admin', is_active]
  );
  return result.rows[0];
};

const getAdminById = async (req, id) => {
  const result = await req.app.get('pool').query(
    'SELECT id, username, email, phone, role, is_active, created_at FROM admins WHERE id = $1 LIMIT 1',
    [id]
  );
  return result.rows[0];
};

const getAdmins = async (req) => {
  const result = await req.app.get('pool').query(
    `SELECT DISTINCT ON (id) id, username, email, phone, role, is_active, created_at
     FROM admins 
     ORDER BY id, created_at DESC`
  );
  return result.rows;
};

const updateAdmin = async (req, { id, username, email, phone, role, hashedPassword, is_active }) => {
  const result = await req.app.get('pool').query(
    `UPDATE admins
     SET username = $1, email = $2, phone = $3, role = $4,
         password = COALESCE($5, password), is_active = COALESCE($6, is_active)
     WHERE id = $7
     RETURNING id, username, email, phone, role, is_active, created_at`,
    [username, email || null, phone || null, role || 'admin', hashedPassword || null, is_active ?? null, id]
  );
  return result.rows[0];
};

module.exports = {
  getAdminByEmail,
  getAdminByUsername,
  getAdminByPhone,
  insertAdmin,
  getAdminById,
  getAdmins,
  updateAdmin
};
