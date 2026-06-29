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

const clearBayStaffByBayId = async (req, bayId) => {
  const query = `
  DELETE FROM baycurrent WHERE bay_id = $1 RETURNING *
  `;

  const values = [
    bayId
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
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

const getBayStaffDetailByBayId = async (req, bay_id) => {
  const query = `
    SELECT
      s.no,
      s.name,
      s.nick_name,
      s.type
    FROM baycurrent bc
    LEFT JOIN staff s ON s.no = bc.staff_id
    WHERE bc.bay_id = $1
    ORDER BY s.nick_name, s.name, s.no
  `;

  const values = [bay_id];

  const result = await req.app.get('pool').query(query, values);
  return result.rows;
};

const getBayCurrentByStaffId = async (req, staffId) => {
  const query = `
  SELECT * FROM baycurrent WHERE staff_id = $1
  `;

  const values = [
    staffId
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  return result.rows;
};

const removeStaffByStaffId = async (req, staffId) => {
  const query = `
  DELETE FROM baycurrent WHERE staff_id = $1 RETURNING *
  `;

  const values = [
    staffId
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  return result.rows;
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

const getBayPerformanceAnalytics = async (req, date, model) => {
  const query = `
    SELECT
      b.name AS bay_name,
      c.no AS checkin_id,
      c.type,
      c.status,
      c.checkin_time,
      c.checkout_time,
      m.no AS masterlist_id,
      m.fitment_id,
      m.seq,
      m.chassis,
      m.model_code,
      m.model_description,
      COALESCE(task_summary.estimated_cycle_time, 0) AS estimated_cycle_time,
      CASE
        WHEN c.checkin_time IS NOT NULL AND c.checkout_time IS NOT NULL
        THEN ROUND(EXTRACT(EPOCH FROM (c.checkout_time - c.checkin_time)) / 60.0, 2)
        ELSE NULL
      END AS actual_cycle_time,
      COALESCE(staff_summary.staff_names, '') AS staff_names
    FROM checkin c
    LEFT JOIN bay b ON b.no = c.bay_id
    LEFT JOIN masterlist m ON m.no = c.masterlist_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(t.duration), 0) AS estimated_cycle_time
      FROM task_item t
      WHERE t.masterlist_id = c.masterlist_id
        AND t.type = c.type
    ) AS task_summary ON TRUE
    LEFT JOIN LATERAL (
      SELECT STRING_AGG(DISTINCT COALESCE(s.nick_name, s.name), ', ' ORDER BY COALESCE(s.nick_name, s.name)) AS staff_names
      FROM checkin_staff cs
      LEFT JOIN staff s ON s.no = cs.staff_id
      WHERE cs.checkin_id = c.no
    ) AS staff_summary ON TRUE
    WHERE c.checkin_time IS NOT NULL
      AND ($1::date IS NULL OR c.checkin_time::date = $1::date)
      AND (
        $2::text IS NULL
        OR m.model_description ILIKE $2
        OR m.model_code ILIKE $2
      )
    ORDER BY b.name ASC, c.checkin_time ASC, c.no ASC
  `;

  const values = [
    date || null,
    model ? `%${model}%` : null
  ];

  const result = await req.app.get('pool').query(query, values);
  const rows = Array.isArray(result.rows) ? result.rows : [];
  const summaryMap = new Map();
  const detailMap = new Map();
  const modelSet = new Set();

  rows.forEach((row) => {
    const bayName = row?.bay_name || 'Unknown';
    const estimatedCycleTime = Number(row?.estimated_cycle_time) || 0;
    const actualCycleTime = row?.actual_cycle_time === null || row?.actual_cycle_time === undefined
      ? null
      : Number(row.actual_cycle_time);
    const modelDescription = row?.model_description || '';
    const staffNames = String(row?.staff_names || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    if (modelDescription) {
      modelSet.add(modelDescription);
    }

    if (!summaryMap.has(bayName)) {
      summaryMap.set(bayName, {
        bay_name: bayName,
        total_tasks: 0,
        total_estimated_cycle_time: 0,
        total_actual_cycle_time: 0,
        staff_names: new Set(),
        models: new Set()
      });
    }

    const summary = summaryMap.get(bayName);
    summary.total_tasks += 1;
    summary.total_estimated_cycle_time += estimatedCycleTime;
    summary.total_actual_cycle_time += actualCycleTime || 0;
    staffNames.forEach((name) => summary.staff_names.add(name));
    if (modelDescription) {
      summary.models.add(modelDescription);
    }

    if (!detailMap.has(bayName)) {
      detailMap.set(bayName, []);
    }

    detailMap.get(bayName).push({
      bay_name: bayName,
      checkin_id: row.checkin_id,
      masterlist_id: row.masterlist_id,
      fitment_id: row.fitment_id,
      seq: row.seq,
      chassis: row.chassis,
      model_code: row.model_code,
      model_description: modelDescription,
      type: row.type,
      status: row.status,
      checkin_time: row.checkin_time,
      checkout_time: row.checkout_time,
      estimated_cycle_time: estimatedCycleTime,
      actual_cycle_time: actualCycleTime,
      staff_names: staffNames
    });
  });

  return {
    summary: Array.from(summaryMap.values()).map((item) => ({
      bay_name: item.bay_name,
      total_tasks: item.total_tasks,
      total_estimated_cycle_time: Number(item.total_estimated_cycle_time.toFixed(2)),
      total_actual_cycle_time: Number(item.total_actual_cycle_time.toFixed(2)),
      staff_names: Array.from(item.staff_names),
      models: Array.from(item.models)
    })),
    details: Object.fromEntries(detailMap.entries()),
    available_models: Array.from(modelSet).sort((a, b) => a.localeCompare(b))
  };
};

module.exports = {
  selectBayStaff,
  getBayCheckinListByStatus,
  getBayList,
  getStaffEmptyBay,
  quickFromBay,
  clearBayStaffByBayId,
  selectBayByName,
  getBayStaffDetailByBayId,
  getBayCurrentByStaffId,
  removeStaffByStaffId,
  addStaff,
  getBayCheckinList,
  getBayHistoryByDate,
  insertBayLog,
  getBayPerformanceAnalytics
};
