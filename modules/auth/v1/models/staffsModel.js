require('dotenv').config();

const insertStaffsModel = async (req, staffs) => {
  const client = req.db; // assuming `req.db` is pg client

  const columns = [
    "staff_id", "name", "ic", "bank_name", "acc_number",
    "nick_name", "type", "photo", "email", "gender",
    "kwsp_id", "contact"
  ];

  // Generate placeholders like ($1,$2,...), ($13,$14,...) for each row
  const values = [];
  const placeholders = staffs.map((staff, i) => {
    const baseIndex = i * columns.length;
    values.push(
      staff.staff_id,
      staff.name,
      staff.ic,
      staff.bank_name,
      staff.acc_number,
      staff.nick_name,
      staff.type,
      staff.photo,
      staff.email,
      staff.gender,
      staff.kwsp_id,
      staff.contact
    );
    return `(${columns.map((_, j) => `$${baseIndex + j + 1}`).join(",")})`;
  }).join(",");

  const sql = `
    INSERT INTO staff (${columns.join(", ")})
    VALUES ${placeholders}
  `;

  // return client.query(sql, values);

  const result = await req.app.get('pool').query(
    sql,
    values
  );
  return result.rows


};

const getFullStaff = async (req  ) => {

  const query = `SELECT * FROM staff`;

  const values = [
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows;
};

const updateStaffBystaff_id = async (req, payload = {}) => {
  const identifier = payload.no || payload.id || payload.staff_no || payload.staff_id;
  if (!identifier) {
    const err = new Error('Staff identifier (no or staff_id) is required');
    err.status = 400;
    throw err;
  }

  const updatable = {
    staff_id: payload.staff_id,
    name: payload.name,
    ic: payload.ic,
    bank_name: payload.bank_name,
    acc_number: payload.acc_number,
    nick_name: payload.nick_name,
    type: payload.type,
    contact: payload.contact,
    email: payload.email,
    kwsp_id: payload.kwsp_id,
    photo: payload.photo,
    gender: payload.gender
  };

  const entries = Object.entries(updatable).filter(([, value]) => value !== undefined);
  if (!entries.length) {
    const err = new Error('No staff fields provided to update');
    err.status = 400;
    throw err;
  }

  const setClauses = entries.map(([key], idx) => `${key} = $${idx + 1}`);
  const values = entries.map(([, value]) => value);

  const whereColumn = payload.no || payload.id || payload.staff_no ? 'no' : 'staff_id';
  values.push(identifier);

  const query = `UPDATE staff SET ${setClauses.join(', ')} WHERE ${whereColumn} = $${values.length} RETURNING *`;
  const result = await req.app.get('pool').query(query, values);

  if (result.rowCount === 0) {
    const err = new Error(`Staff not found for ${whereColumn} ${identifier}`);
    err.status = 404;
    throw err;
  }

  return result.rows[0];
};

const getStaffById = async (req , staff_id ) => {

  const query = `SELECT * FROM staff WHERE no = $1`;

  const values = [
    staff_id
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows[0];
};

const insertStaff = async (req, staff) => {
  const columns = [
    "staff_id", "name", "ic", "bank_name", "acc_number",
    "nick_name", "type", "photo", "email", "gender",
    "kwsp_id", "contact"
  ];
  

  const query = `
    INSERT INTO staff (${columns.join(', ')})
    VALUES (${columns.map((_, idx) => `$${idx + 1}`).join(', ')})
    RETURNING *
  `;

  const values = [
    staff.staff_id || null,
    staff.name || null,
    staff.ic || null,
    staff.bank_name || null,
    staff.acc_number || null,
    staff.nick_name || null,
    staff.type || null,
    staff.photo || null,
    staff.email || null,
    staff.gender || null,
    staff.kwsp_id || null,
    staff.contact || null
  ];

  const result = await req.app.get('pool').query(query, values);
  return result.rows[0];
};

module.exports = {
  insertStaffsModel,
  getFullStaff,
  updateStaffBystaff_id,
  getStaffById,
  insertStaff
};
