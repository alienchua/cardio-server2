require('dotenv').config();

const getUserByEmail = async (req, email) => {
  const result = await req.app.get('pool').query('SELECT * FROM users WHERE email = $1', [email]);
  return result.rows[0];
};

const getUserByUsername = async (req, username) => {
  const result = await req.app.get('pool').query('SELECT * FROM users WHERE username = $1', [username]);
  return result.rows[0];
};
const getUserByPhone = async (req, phone) => {
  const res = await req.app.get('pool').query('SELECT * FROM users WHERE phone = $1', [phone]);
  console.log(res.rows)
  return res.rows[0];
};

const getUserByPhoneOrEmail = async (req, phone , email) => {
  const res = await req.app.get('pool').query('SELECT * FROM users WHERE phone_number = $1 OR email = $2', [phone , email]);
  console.log(res.rows)
  return res.rows[0];
};

const createUser = async (req, username,email,phone_country,phone_number,password,wallet,earn,status) => {
  const result = await req.app.get('pool').query(
    `INSERT INTO users (
  username,email,phone_country,phone_number,password,wallet,earn,status
) VALUES  ($1, $2, $3, $4, $5, $6, $7 , $8) RETURNING *`,
    [username,email,phone_country,phone_number,password,wallet,earn,status]
  );
  return result.rows[0];
};

const createAccessToken = async (req, userId, token, expiresAt) => {
  const result = await req.app.get('pool').query(
    'INSERT INTO access_tokens (token, user_id, expires_at) VALUES ($1, $2, $3) RETURNING *',
    [token, userId, expiresAt]
  );
  return result.rows[0];
};

const createRefreshToken = async (req, userId, token, expiresAt) => {
  const result = await req.app.get('pool').query(
    'INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES ($1, $2, $3) RETURNING *',
    [token, userId, expiresAt]
  );
  return result.rows[0];
};

const deleteAccessToken = async (req, token) => {
  await req.app.get('pool').query('DELETE FROM access_tokens WHERE token = $1', [token]);
};

const deleteRefreshToken = async (req, token) => {
  await req.app.get('pool').query('DELETE FROM refresh_tokens WHERE token = $1', [token]);
};

const getRefreshToken = async (req, token) => {
  const result = await req.app.get('pool').query('SELECT * FROM refresh_tokens WHERE token = $1', [token]);
  return result.rows[0];
};

const updateLastLogin = async (req, userId) => {
  await req.app.get('pool').query('UPDATE users SET last_login = $1 WHERE id = $2', [new Date(), userId]);
};

const updateUserPoint = async (req, point ,userId) => {
  await req.app.get('pool').query('UPDATE users SET point = $1 WHERE id = $2', [point, userId]);
};

// new api

const updateUserEarn = async (req, amount ,userId) => {
  const result = await req.app.get('pool').query('UPDATE users SET earn = $1 WHERE id = $2 AND earn + $1 > 0 RETURNING *', [amount, userId]);
  return result.rows[0];
};

const updateUserWallet = async (req, amount ,userId) => {
  const result = await req.app.get('pool').query('UPDATE users SET wallet = $1 WHERE id = $2 AND earn + $1 > 0 RETURNING *', [amount, userId]);
  return result.rows[0];
};

module.exports = {
  getUserByEmail,
  getUserByUsername,
  createUser,
  createAccessToken,
  createRefreshToken,
  deleteAccessToken,
  deleteRefreshToken,
  getRefreshToken,
  getUserByPhone,
  updateLastLogin,
  updateUserPoint,
  updateUserEarn, 
  updateUserWallet,
  getUserByPhoneOrEmail
};