require('dotenv').config();

const selectBayStaff = async (req, bay_id) => {

  const query = `
   SELECT b.* , s.type FROM baycurrent b LEFT JOIN staff s ON s.no = b.staff_id WHERE bay_id = $1
  `;

  const values = [
    bay_id
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows;
};

const getBayCheckinListByStatus = async (req, type) => {

  const query = `
    SELECT 
  b.*,
  (
    SELECT json_agg(
      json_build_object(
        'photo', s.photo,
        'name', s.name,
        'type', s.type,
        'no', s.no
      )
    )
    FROM baycurrent bc
    LEFT JOIN staff s ON s.no = bc.staff_id
    WHERE bc.bay_id = b.no
  ) AS bay_list,
  (
  SELECT json_agg(
  json_build_object(
    'no', q.no,
    'chassis', q.chassis,
    'fitment_id', q.fitment_id,
    'checkin_time', q.checkin_time,
    'model_description', q.model_description,
    'checkin_id', q.checkin_id,
    'duration', q.duration
  )
)
FROM (
  SELECT 
    m.no,
    m.chassis,
    m.fitment_id,
    c.created_at AS checkin_time,
    m.model_description,
    c.no AS checkin_id,
    COALESCE(SUM(t.duration), 0) AS duration
  FROM checkin c
  LEFT JOIN masterlist m ON m.no = c.masterlist_id
  LEFT JOIN task_item t ON t.masterlist_id = m.no
  WHERE c.bay_id = b.no
    AND c.status = 'Check-In'
  GROUP BY m.no, m.chassis, m.fitment_id, c.created_at, m.model_description, c.no
) AS q

  ) AS checkin_list

FROM bay b WHERE b.type = $1


  `;

  const values = [
    type
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows;
};

const getBayCheckinList = async (req) => {

  const query = `
    SELECT 
  b.*,
  (
    SELECT json_agg(
      json_build_object(
        'photo', s.photo,
        'name', s.name,
        'type', s.type,
        'no', s.no
      )
    )
    FROM baycurrent bc
    LEFT JOIN staff s ON s.no = bc.staff_id
    WHERE bc.bay_id = b.no
  ) AS bay_list,
  (
  SELECT json_agg(
  json_build_object(
    'no', q.no,
    'chassis', q.chassis,
    'fitment_id', q.fitment_id,
    'checkin_time', q.checkin_time,
    'model_description', q.model_description,
    'checkin_id', q.checkin_id,
    'duration', q.duration
  )
)
FROM (
  SELECT 
    m.no,
    m.chassis,
    m.fitment_id,
    c.created_at AS checkin_time,
    m.model_description,
    c.no AS checkin_id,
    COALESCE(SUM(t.duration), 0) AS duration
  FROM checkin c
  LEFT JOIN masterlist m ON m.no = c.masterlist_id
  LEFT JOIN task_item t ON t.masterlist_id = m.no
  WHERE c.bay_id = b.no
    AND c.status = 'Check-In'
  GROUP BY m.no, m.chassis, m.fitment_id, c.created_at, m.model_description, c.no
) AS q

  ) AS checkin_list

FROM bay b 
  `;

  const values = [
    
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows;
};

const getBayList = async (req, type) => {

  const query = `SELECT 
    LEFT(b.name, 1) AS bay_group,
    json_agg(
        json_build_object(
            'bay', b.name,
            'staffs', (
                SELECT jsonb_agg(
                    DISTINCT jsonb_build_object(
                        'staff_id', s.no,
                        'staff_name', s.nick_name,
                        'baycurrenid' , bc2.no
                    )
                )
                FROM baycurrent bc2
                LEFT JOIN staff s ON s.no = bc2.staff_id
                WHERE bc2.bay_id = b.no
            )
        )
        ORDER BY b.name
    ) AS bays
FROM bay b
WHERE LEFT(b.name, 1) != 'E'
GROUP BY bay_group
ORDER BY bay_group;

  `;

  const values = [
  
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows;
};


const getStaffEmptyBay = async (req) => {

  const query = `
   SELECT s.* FROM staff s 
  LEFT JOIN baycurrent b ON b.staff_id = s.no
  WHERE b.no IS NULL
  `;

  const values = [
    
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows;
};

const quickFromBay = async (req , bayId) => {

  const query = `
  DELETE FROM baycurrent WHERE no = $1 RETURNING *
  `;

  const values = [
    bayId
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows;
};

const selectBayByName = async (req , name) => {

  const query = `
  SELECT * FROM bay WHERE name = $1
  `;

  const values = [
    name
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows[0];
};

const addStaff = async (req , staff_id , bay_id) => {

  const query = `
 INSERT INTO baycurrent (staff_id , bay_id) VALUES ($1 , $2)
  `;

  const values = [
    staff_id , bay_id
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows[0];
};

const getBayHistoryByDate = async (req , date) => {

  const query = `
    SELECT 
      bl.no,
      to_char(DATE(bl.created_at), 'YYYY-MM-DD') AS created_date,
      to_char(bl.created_at, 'HH24:MI') AS created_time,
      bl.created_at,
      bl.remark,
      bl.staff_id,
      bl.action_by,
      bl.bay_id,
      b.name AS bay_name,
      s.name AS staff_name,
      s.nick_name,
      s.type AS staff_type,
      a.username AS action_by_name
    FROM baylog bl
    LEFT JOIN bay b ON b.no = bl.bay_id
    LEFT JOIN staff s ON s.no = bl.staff_id
    LEFT JOIN admins a ON a.id = bl.action_by
    WHERE ($1::date IS NULL OR bl.created_at::date = $1::date)
    ORDER BY b.name, bl.created_at DESC
  `;

  const values = [
    date || null
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows;
};

const insertBayLog = async (req, { remark, staff_id, bay_id, action_by = 4 }) => {

  const query = `
    INSERT INTO baylog (remark, staff_id, bay_id, action_by)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `;

  const values = [
    remark,
    staff_id || null,
    bay_id || null,
    action_by
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  return result.rows[0];
};

module.exports = {
  selectBayStaff,
  getBayCheckinListByStatus,
  getBayList,
  getStaffEmptyBay,
  quickFromBay,
  selectBayByName,
  addStaff,
  getBayCheckinList,
  getBayHistoryByDate,
  insertBayLog
};
