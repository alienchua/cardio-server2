require('dotenv').config();

const insertMasterlist = async (req, data) => {

      const query = `
      INSERT INTO masterlist (
        chassis, seq, fitment_id, model_code, model_description,
        colour, accessories_std, accessories_otp, accessories_full,
        caout_date, caout_time, cafi_date
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *`;
    const values = [
      data.chassis, data.seq, data.fitment_id, data.model_code, data.model_description,
      data.colour, data.accessories_std, data.accessories_otp, data.accessories_full,
      data.caout_date , data.caout_time, data.cafi_date
    ];

    const result = await req.app.get('pool').query(
      query,
      values
    );
    // const res = await req.query(query, values);
    return result.rows[0].no;

}

const insertTaskItem = async (req, data) => {

  const query = `
    INSERT INTO task_item (masterlist_id, accessories_id, price, duration, type, short_name)
    VALUES ($1,$2,$3,$4,$5,$6)
  `;

  console.log( data.masterlist_id, data.accessories_id, data.price, data.duration, data.type, data.short_name)
  const values = [
    data.masterlist_id, data.accessories_id, data.price, data.duration, data.type, data.short_name
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows[0];
};

const insertCheckIN = async (req,  masterlist_id , action_by , bay_id , status , type) => {

  const query = `INSERT INTO checkin (masterlist_id , action_by , bay_id , status , type) VALUES ($1,$2,$3,$4, $5)
    RETURNING *
  `;

  const values = [
    masterlist_id , action_by , bay_id , status , type
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows[0];
};

const searchCheckIN = async (req,  masterlist_id, type ) => {

  const query = `SELECT * FROM checkin WHERE masterlist_id = $1 AND type = $2 ORDER BY no DESC LIMIT 1`;

  const values = [
    masterlist_id ,
    type
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows[0];
};

const checkType = async (req,  masterlist_id, type ) => {

  const query = `SELECT type , masterlist_id FROM task_item WHERE (TRIM(type) = $2) AND masterlist_id = $1
                GROUP BY type ,masterlist_id`;

  const values = [
    masterlist_id ,
    type
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows[0];
};

const searchMasterlist = async (req,  chassis, seq  ) => {

  const query = `SELECT * FROM masterlist WHERE chassis = $1 AND fitment_id = $2 LIMIT 1`;

  const values = [
    chassis ,  seq
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows[0];
};

const insertCheckInStaff = async (req, checkin_id, staff_id , position) => {

  const query = `
    INSERT INTO checkin_staff (checkin_id, staff_id , position)
    VALUES ($1,$2 , $3)
  `;

  const values = [
    checkin_id, staff_id, position
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows;
};

const updateCheckIn = async (req,  masterlist_id , remark , type) => {

  const query = `UPDATE checkin SET status = 'Check-Out' , checkout_time = $1  , remark = $3 WHERE masterlist_id = $2 AND type = $4  RETURNING *`;

  const values = [
    new Date() ,  masterlist_id , remark , type
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows[0];
};


const getCheckInList = async (req ) => {

  const query = `SELECT c.* , m.chassis , m.fitment_id, m.seq , b.name , count(c2.*) as total_staff FROM checkin c 
LEFT JOIN masterlist m ON m.no = c.masterlist_id
LEFT JOIN bay b ON b.no = c.bay_id
LEFT JOIN checkin_staff c2 on c2.checkin_id = c.no WHERE c.status = 'Check-In'
GROUP BY m.chassis , m.seq , b.name , c.no , m.fitment_id`;

  const values = [
   
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows;
};

const getMasterList = async (req, data) => {

  const query = `
  SELECT  m.*,  sum(t.price) as total FROM masterlist m LEFT JOIN task_item t ON t.masterlist_id = m.no GROUP BY m.no
  `;
  const values = [
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows
};

const getMasterList2 = async (req, data ) => {
  let filters = [];
  let values = [];
  let idx = 1;

  // Optional filters
  if (data.chassis) {
    filters.push(`m.chassis ILIKE $${idx++}`);
    values.push(`%${data.chassis}%`);
  }

  if (data.model) {
    filters.push(`m.model_description ILIKE $${idx++}`);
    values.push(`%${data.model}%`);
  }

  if (data.fitment_id) {
    filters.push(`m.fitment_id ILIKE $${idx++}`);
    values.push(`%${data.fitment_id}%`);
  }

  if (data.seq) {
    filters.push(`m.seq = $${idx++}`);
    values.push(Number(data.seq));
  }

  if (data.date_from && data.date_to) {
    filters.push(`m.cafi_date BETWEEN $${idx++} AND $${idx++}`);
    values.push(data.date_from);
    values.push(data.date_to);
  } else if (data.date_from) {
    filters.push(`m.cafi_date >= $${idx++}`);
    values.push(data.date_from);
  } else if (data.date_to) {
    filters.push(`m.cafi_date <= $${idx++}`);
    values.push(data.date_to);
  }

  // Base query

  console.log(values)
  let query = `
    SELECT m.*, SUM(t.price) AS total
    FROM masterlist m
    LEFT JOIN task_item t ON t.masterlist_id = m.no
  `;

  // Apply filters if exist
  if (filters.length > 0) {
    query += ` WHERE ${filters.join(' AND ')}`;
  }

  query += ` GROUP BY m.no`;

  const result = await req.app.get('pool').query(query, values);
  return result.rows;
};

const getTasksList = async (req, data) => {

  const query = `
    SELECT m.* , m2.type , c.status , b.name , sum(t.price) as total , sum(t.duration) as duration,
    c.checkout_time , c.remark, c.created_at as checkin_time ,
    (EXTRACT(EPOCH FROM (c.checkout_time - c.created_at)) / 60)::int AS diff_minutes  FROM masterlist m 
  LEFT JOIN (SELECT TRIM(type)as type , masterlist_id FROM task_item WHERE (TRIM(type) = 'FITMENT' 
  OR TRIM(type) = 'HOIST') GROUP BY TRIM(type) ,masterlist_id) m2 ON m2.masterlist_id = m.no
  LEFT JOIN checkin c ON m.no = c.masterlist_id AND c.type = m2.type
  LEFT JOIN bay b ON b.no = c.bay_id
  LEFT JOIN task_item t ON t.masterlist_id = m.no AND t.type = m2.type
  GROUP BY c.status , b.name , m.no , c.created_at ,  c.checkout_time , c.remark , m2.type


  `;
  const values = [
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows
};

const getTasksList2 = async (req, data ) => {
  const filters = [];
  const values = [];
  let i = 1;

  console.log(data)


  // 🔹 Text filters (optional)
  if (data.chassis) {
    filters.push(`m.chassis ILIKE $${i++}`);
    values.push(`%${data.chassis}%`);
  }

  if (data.fitment_id) {
    filters.push(`m.fitment_id ILIKE $${i++}`);
    values.push(`%${data.fitment_id}%`);
  }

  if (data.model) {
    filters.push(`m.model_description ILIKE $${i++}`);
    values.push(`%${data.model}%`);
  }

  if (data.seq) {
    filters.push(`m.seq = $${i++}`);
    values.push(Number(data.seq));
  }

  if (data.type  && data.type !== 'All') {
    filters.push(`m2.type ILIKE $${i++}`);
    values.push(`%${data.type}%`);
  }

  // 🔹 Date range filter (optional)
  if (data.date_from && data.date_to) {
    filters.push(`m.cafi_date BETWEEN $${i++} AND $${i++}`);
    values.push(data.date_from, data.date_to);
  } else if (data.date_from) {
    filters.push(`m.cafi_date >= $${i++}`);
    values.push(data.date_from);
  } else if (data.date_to) {
    filters.push(`m.cafi_date <= $${i++}`);
    values.push(data.date_to);
  }

  // 🔹 Base query
  let query = `
    SELECT 
      m.*, 
      m2.type, 
      c.status, 
      b.name, 
      SUM(t.price) AS total, 
      SUM(t.duration) AS duration,
      c.checkout_time, 
      c.remark, 
      c.created_at AS checkin_time 
    FROM masterlist m 
    LEFT JOIN (
      SELECT 
        TRIM(type) AS type, 
        masterlist_id 
      FROM task_item 
      WHERE TRIM(type) = 'FITMENT' OR TRIM(type) = 'HOIST'
      GROUP BY TRIM(type), masterlist_id
    ) m2 ON m2.masterlist_id = m.no
    LEFT JOIN checkin c ON m.no = c.masterlist_id AND c.type = m2.type
    LEFT JOIN bay b ON b.no = c.bay_id
    LEFT JOIN task_item t ON t.masterlist_id = m.no AND t.type = m2.type
  `;

  // 🔹 Add WHERE if needed
  if (filters.length > 0) {
    query += ` WHERE ${filters.join(' AND ')}`;
  }

  query += `
    GROUP BY 
      c.status, 
      b.name, 
      m.no, 
      c.created_at,  
      c.checkout_time, 
      c.remark, 
      m2.type
  `;

  const result = await req.app.get('pool').query(query, values);
  return result.rows;
};



const getTasksAnalisys = async (req, data) => {

  const query = `
    with selectdata AS (
SELECT  c.status FROM masterlist m 
LEFT JOIN (SELECT TRIM(type)as type , masterlist_id FROM task_item WHERE (TRIM(type) = 'FITMENT' 
OR TRIM(type) = 'HOIST') GROUP BY TRIM(type) ,masterlist_id) m2 ON m2.masterlist_id = m.no
LEFT JOIN checkin c ON m.no = c.masterlist_id AND c.type = m2.type
) SELECT status, count(*) FROM selectdata GROUP BY status
  `;
  const values = [
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows
};

const getTasksAnalisys2 = async (req, data ) => {
  const filters = [];
  const values = [];
  let i = 1;

  console.log('testing')
  console.log(data)

  // 🔹 Optional filters
  if (data.chassis) {
    filters.push(`m.chassis ILIKE $${i++}`);
    values.push(`%${data.chassis}%`);
  }

  if (data.fitment_id) {
    filters.push(`m.fitment_id ILIKE $${i++}`);
    values.push(`%${data.fitment_id}%`);
  }

  if (data.model) {
    filters.push(`m.model_description ILIKE $${i++}`);
    values.push(`%${data.model}%`);
  }

  if (data.seq) {
    filters.push(`m.seq = $${i++}`);
    values.push(Number(data.seq));
  }

  if (data.type && data.type !== 'All') {
    filters.push(`m2.type ILIKE $${i++}`);
    values.push(`%${data.type}%`);
  }

  // 🔹 Date range filters (for CAFI date)
  if (data.date_from && data.date_to) {
    filters.push(`m.cafi_date BETWEEN $${i++} AND $${i++}`);
    values.push(data.date_from, data.date_to);
  } else if (data.date_from) {
    filters.push(`m.cafi_date >= $${i++}`);
    values.push(data.date_from);
  } else if (data.date_to) {
    filters.push(`m.cafi_date <= $${i++}`);
    values.push(data.date_to);
  }

  // 🔹 Base query with optional filter injection
  let query = `
    WITH selectdata AS (
      SELECT 
        c.status
      FROM masterlist m 
      LEFT JOIN (
        SELECT 
          TRIM(type) AS type, 
          masterlist_id 
        FROM task_item 
        WHERE TRIM(type) IN ('FITMENT', 'HOIST')
        GROUP BY TRIM(type), masterlist_id
      ) m2 ON m2.masterlist_id = m.no
      LEFT JOIN checkin c ON m.no = c.masterlist_id AND c.type = m2.type
  `;

  if (filters.length > 0) {
    query += ` WHERE ${filters.join(' AND ')}`;
  }

  query += `
    )
    SELECT 
      status, 
      COUNT(*)  
    FROM selectdata 
    GROUP BY status
  `;

  const result = await req.app.get('pool').query(query, values);
  return result.rows;
};


const getMasterListByNo = async (req, no) => {

  const query = `
  SELECT * FROM masterlist WHERE no = $1
  `;
  const values = [
    no
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows[0]
};

const getCheckInByMasterNo = async (req, no) => {

  const query = `
  SELECT c.* , b.name FROM checkin c
    LEFT JOIN bay b ON b.no = c.bay_id
  WHERE masterlist_id = $1
  `;
  const values = [
    no
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows[0]
};

const getCheckInByMasterNo2 = async (req, no) => {

  const query = `
    SELECT c.* , b.name , 
  json_agg (json_build_object('name' , s.name , 'type' , s.type , 'photo' , s.photo)) as staff FROM checkin c
  LEFT JOIN bay b ON b.no = c.bay_id
  LEFT JOIN checkin_staff c2 ON c2.checkin_id = c.no
  LEFT JOIN staff s ON s.no = c2.staff_id
  WHERE masterlist_id = $1 GROUP BY c.no , b.name
  `;
  const values = [
    no
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows
};

const getItemByMasterNo = async (req, no) => {

  const query = `
  SELECT * FROM task_item WHERE masterlist_id = $1 AND type != 'New' AND type != 'Excluded'
  `;
  const values = [
    no
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows
};

const getCheckInStaff = async (req, no) => {

  const query = `
  SELECT * FROM checkin_staff c LEFT JOIN staff s ON s.no = c.staff_id WHERE c.checkin_id = $1

  `;
  const values = [
    no
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows
};

const insertTaskOffset = async (req, masterlist_id , action_by , amount , remark , staff_id , amount2) => {

  const query = `
  INSERT INTO task_offset (masterlist_id , action_by , amount , remark , staff_id , amount2) VALUES 
  ( $1, $2, $3, $4, $5 , $6) RETURNING *
  `;
  const values = [
    masterlist_id , action_by , amount , remark , staff_id , amount2
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows
};

const getTaskOffset = async (req, masterlist_id  ) => {

  const query = `
  SELECT t.* , (t.amount + t.amount2) as total_amount , s.nick_name FROM task_offset t
LEFT JOIN staff s ON s.no = t.staff_id
WHERE  t.masterlist_id = $1
  `;
  const values = [
    masterlist_id 
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows
};

const checkCheckinStaff = async (req, staff_id  ) => {

  const query = `
SELECT * FROM checkin c LEFT JOIN checkin_staff c2 ON c2.checkin_id = c.no WHERE c.status = 'Checkin' AND c2.staff_id = $1
  `;
  const values = [
    staff_id 
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows
};

const checkCheckinNumber = async (req, bay_id  ) => {

  const query = `
SELECT count(*) as total FROM checkin WHERE bay_id = $1 AND status = 'Check-In'
  `;
  const values = [
    bay_id 
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows[0]
};


const deleteCheckinStaff = async (req, checkin_id  ) => {

  const query = `
DELETE FROM checkin_staff WHERE no = $1
  `;
  const values = [
    checkin_id 
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows[0]
};

module.exports = {
  insertMasterlist,
  insertTaskItem,
  insertCheckIN,
  searchCheckIN,
  searchMasterlist,
  insertCheckInStaff,
  updateCheckIn,
  getCheckInList,
  getMasterList,
  getMasterListByNo,
  getCheckInByMasterNo,
  getItemByMasterNo,
  getCheckInStaff,
  insertTaskOffset,
  getTaskOffset,
  checkType,
  getTasksList,
  getTasksAnalisys,
  getCheckInByMasterNo2,
  checkCheckinStaff,
  checkCheckinNumber,
  getTasksList2,
  getTasksAnalisys2,
  getMasterList2,
  deleteCheckinStaff
};