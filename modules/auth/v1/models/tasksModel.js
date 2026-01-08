require('dotenv').config();

const insertMasterlist = async (req, data) => {

      const query = `
       INSERT INTO masterlist (
    chassis, seq, fitment_id, model_code, model_description,
    colour, accessories_std, accessories_otp, accessories_full,
    caout_date, caout_time, cafi_date
  )
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
  ON CONFLICT (chassis, fitment_id)
  DO UPDATE SET 
    caout_date = EXCLUDED.caout_date,
    caout_time = EXCLUDED.caout_time
  RETURNING *,    CASE 
        WHEN xmax = 0 THEN 'inserted'
        ELSE 'updated'
      END AS operation;`;
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
    return {
      id:  result.rows[0].no , // depending on your table structure
      operation:   result.rows[0].operation
    };

}

const insertTaskItem = async (req, data) => {

  const query = `
    INSERT INTO task_item (masterlist_id, accessories_id, price, duration, type, short_name)
    VALUES ($1,$2,$3,$4,$5,$6)
  `;

  // console.log( data.masterlist_id, data.accessories_id, data.price, data.duration, data.type, data.short_name)
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

  const query = `INSERT INTO checkin (masterlist_id , action_by , bay_id , status , type, accessory_status 
) VALUES ($1,$2,$3,$4, $5, 'Pending')
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

const searchMasterlistByno = async (req,  no ) => {

  const query = `SELECT * FROM masterlist WHERE no = $1 LIMIT 1`;

  const values = [
    no
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows[0];
};

const findMasterByChassisSeq = async (req, chassis, seq) => {
  const query = `SELECT * FROM masterlist WHERE chassis = $1 AND seq = $2 LIMIT 1`;

  const values = [chassis, seq];

  const result = await req.app.get('pool').query(query, values);
  return result.rows[0];
};

const findStaffNosByStaffIds = async (req, staffIds = []) => {
  const filtered = (staffIds || [])
    .filter((id) => id !== undefined && id !== null)
    .map((id) => String(id));
  if (filtered.length === 0) return [];

  const query = `
    SELECT no, staff_id, name, nick_name, type
    FROM staff
    WHERE staff_id = ANY($1)
  `;

  const values = [filtered];
  const result = await req.app.get('pool').query(query, values);
  return result.rows;
};

const insertManualCheckIn = async (req, payload) => {
  const {
    masterlist_id,
    action_by,
    bay_id,
    status,
    type,
    checkin_time,
    checkout_time,
    remark
  } = payload;

  const query = `
    INSERT INTO checkin (masterlist_id, action_by, bay_id, status, type, accessory_status, checkin_time, checkout_time, remark)
    VALUES ($1, $2, $3, $4, $5, 'Pending', $6, $7, $8)
    RETURNING *
  `;

  const values = [
    masterlist_id,
    action_by,
    bay_id,
    status,
    type,
    checkin_time,
    checkout_time,
    remark || null
  ];

  const result = await req.app.get('pool').query(query, values);
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

const insertCheckInStaffBatch = async (req, checkin_id, staff_ids = []) => {
  const filtered = (staff_ids || []).filter(Boolean);
  if (filtered.length === 0) return [];

  const query = `
    INSERT INTO checkin_staff (checkin_id, staff_id)
    SELECT $1, unnest($2::int[])
    RETURNING *
  `;

  const values = [
    checkin_id,
    filtered.map((id) => Number(id))
  ];

  const result = await req.app.get('pool').query(query, values);
  return result.rows;
};

const updateCheckIn = async (req,  masterlist_id , type ) => {

  // console.log(masterlist_id , type)
  const query = `UPDATE checkin SET status = 'Check-Out' , checkout_time = $1  WHERE no = $2 AND type = $3  RETURNING *`;

  const values = [
    new Date() ,  masterlist_id , type 
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows[0];
};

const updateCheckInNew = async (req, no , bay_id ) => {
  const query = `UPDATE checkin SET status = 'Check-In' , bay_id = $2 WHERE no = $1 RETURNING *`;

  const values = [
   no , bay_id
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows[0];
};

const updateCheckInRemark = async (req,  masterlist_id , type , remark ) => {

  // console.log( remark ,  masterlist_id , type)

  const query = `UPDATE checkin SET remark = $1  WHERE no = $2 AND type = $3  RETURNING *`;
  // console.log(  remark ,  masterlist_id , type)
  const values = [
    remark ,  masterlist_id , type
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

const getCheckInList2 = async (req, type ) => {

  const query = `SELECT 
  c.no,c.created_at,m.fitment_id,m.chassis,b.name AS bay_name, m.model_description,
  COALESCE(SUM(DISTINCT t.duration), 0) AS duration,c.checkin_time, c.remark,
  COALESCE(
    json_agg(
      DISTINCT jsonb_build_object(
        'nick_name', s.nick_name
      )
    ) FILTER (WHERE s.nick_name IS NOT NULL),
    '[]'
  ) AS staff,c.type
FROM checkin c
LEFT JOIN masterlist m ON m.no = c.masterlist_id
LEFT JOIN checkin_staff c2 ON c2.checkin_id = c.no
LEFT JOIN staff s ON s.no = c2.staff_id
LEFT JOIN bay b ON b.no = c.bay_id
LEFT JOIN task_item t ON t.masterlist_id = m.no AND t.type = c.type
WHERE c.status = 'Check-In' AND c.checkin_time IS NOT NULL AND c.type = $1
GROUP BY c.no, c.created_at, m.fitment_id, m.chassis, b.name, c.type, c.checkin_time ,m.model_description, c.remark
ORDER BY c.checkin_time ASC`;

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
    // Compare by date only so timestamps on cafi_date don't break same-day matches
    filters.push(`DATE(m.cafi_date) BETWEEN $${idx++} AND $${idx++}`);
    values.push(data.date_from);
    values.push(data.date_to);
  } else if (data.date_from) {
    filters.push(`DATE(m.cafi_date) >= $${idx++}`);
    values.push(data.date_from);
  } else if (data.date_to) {
    filters.push(`DATE(m.cafi_date) <= $${idx++}`);
    values.push(data.date_to);
  }

  // Base query

  // console.log(values)
  let query = `
    SELECT 
      m.no,
      m.chassis,
      m.seq,
      m.fitment_id,
      m.model_code,
      m.model_description,
      m.colour,
      m.accessories_std,
      to_char(DATE(m.cafi_date), 'YYYY-MM-DD') AS cafi_date,
      to_char(DATE(m.caout_date), 'YYYY-MM-DD') AS caout_date,
      SUM(t.price) AS total
    FROM masterlist m
    LEFT JOIN task_item t ON t.masterlist_id = m.no
  `;

  // Apply filters if exist
  if (filters.length > 0) {
    query += ` WHERE ${filters.join(' AND ')}`;
  }

  query += ` GROUP BY 
    m.no,
    m.chassis,
    m.seq,
    m.fitment_id,
    m.model_code,
    m.model_description,
    m.colour,
    m.accessories_std,
    m.cafi_date,
    m.caout_date`;

  const result = await req.app.get('pool').query(query, values);
  return result.rows;
};

// Count masterlist items with no CAOUT date excluding today's CAFI entries
const getMasterBacklogCount = async (req) => {
  const query = `
    SELECT COUNT(*)::int AS count
    FROM masterlist
    WHERE caout_date IS NULL
      AND (cafi_date IS NULL OR cafi_date < CURRENT_DATE)
  `;

  const result = await req.app.get('pool').query(query);
  return result.rows[0]?.count || 0;
};

// Count tasks that have not been checked in yet (no checkin_time)
const getTasksBacklogCount = async (req) => {
  const query = `
    SELECT COUNT(*)::int AS count
    FROM (
      SELECT 
        m.no
      FROM masterlist m 
      LEFT JOIN (
        SELECT 
          TRIM(type) AS type, 
          masterlist_id 
        FROM task_item 
        WHERE TRIM(type) IN ('FITMENT', 'HOIST')
        GROUP BY TRIM(type), masterlist_id 
      ) m2 ON m2.masterlist_id = m.no
      LEFT JOIN checkin c 
        ON m.no = c.masterlist_id 
        AND c.type = m2.type
      LEFT JOIN bay b 
        ON b.no = c.bay_id
      LEFT JOIN task_item t 
        ON t.masterlist_id = m.no 
        AND t.type = m2.type
      WHERE c.checkin_time IS NULL
    ) AS pending_tasks
  `;

  const result = await req.app.get('pool').query(query);
  return result.rows[0]?.count || 0;
};

// Dashboard aggregated stats
const getDashboardStats = async (req) => {
  const pool = req.app.get('pool');

  // Active bay counts
  const activeBayQuery = `
    SELECT 
      COUNT(*)::int AS total_bays,
      COUNT(DISTINCT bc.bay_id)::int AS staffed_bays
    FROM bay b
    LEFT JOIN baycurrent bc ON bc.bay_id = b.no
    WHERE LEFT(b.name, 1) != 'E'
  `;
  const activeBayRes = await pool.query(activeBayQuery);
  const activeBay = activeBayRes.rows[0] || { total_bays: 0, staffed_bays: 0 };

  // Pending tasks for today (CAFI date today, not finished)
  const pendingTodayQuery = `
    SELECT COUNT(*)::int AS count
    FROM (
      ${/* Base task list */''}
      SELECT 
        m.no,
        m2.type,
        c.status,
        c.checkout_time,
        c.checkin_time
      FROM masterlist m 
      LEFT JOIN (
        SELECT 
          TRIM(type) AS type, 
          masterlist_id 
        FROM task_item 
        WHERE TRIM(type) IN ('FITMENT', 'HOIST')
        GROUP BY TRIM(type), masterlist_id 
      ) m2 ON m2.masterlist_id = m.no
      LEFT JOIN checkin c 
        ON m.no = c.masterlist_id 
        AND c.type = m2.type
      LEFT JOIN bay b 
        ON b.no = c.bay_id
      LEFT JOIN task_item t 
        ON t.masterlist_id = m.no 
        AND t.type = m2.type
      WHERE m.cafi_date = CURRENT_DATE
    ) AS tasks
    WHERE checkout_time IS NULL OR status IS NULL OR status != 'Check-Out'
  `;
  const pendingTodayRes = await pool.query(pendingTodayQuery);

  // Currently check-in (not yet checkout)
  const checkinRes = await pool.query(`SELECT COUNT(*)::int AS count FROM checkin WHERE status = 'Check-In'`);

  // Completed masterlist (all tasks for that masterlist checked out)
  const completedQuery = `
    WITH expected AS (
      SELECT masterlist_id, COUNT(DISTINCT TRIM(type)) AS expected_count
      FROM task_item
      WHERE TRIM(type) IN ('FITMENT','HOIST')
      GROUP BY masterlist_id
    ),
    completed AS (
      SELECT masterlist_id, COUNT(DISTINCT TRIM(type)) AS completed_count
      FROM checkin
      WHERE status = 'Check-Out'
      GROUP BY masterlist_id
    )
    SELECT COUNT(*)::int AS count
    FROM expected e
    LEFT JOIN completed c ON c.masterlist_id = e.masterlist_id
    WHERE e.expected_count > 0 AND COALESCE(c.completed_count, 0) = e.expected_count
  `;
  const completedRes = await pool.query(completedQuery);

  // Backlog from existing helper
  const backlogCount = await getTasksBacklogCount(req);

  // Bay status from current check-ins (andon)
  const bayStatusData = await getCurrentCheckin(req);
  const nowMs = Date.now();
  let bayEmpty = 0;
  let bayOnTime = 0;
  let bayNearly = 0;
  let bayOvertime = 0;
  let bayTotal = 0;

  (bayStatusData || []).forEach((group) => {
    (group?.bays || []).forEach((bay) => {
      bayTotal += 1;
      if (!bay?.checkin_time) {
        bayEmpty += 1;
        return;
      }

      const durationMinutes = Number(bay?.totalduration) || 0;
      if (durationMinutes <= 0) {
        bayOnTime += 1;
        return;
      }

      const checkinMs = new Date(bay.checkin_time).getTime();
      const elapsedMinutes = (nowMs - checkinMs) / 60000;
      const remaining = durationMinutes - elapsedMinutes;

      if (remaining < 0) {
        bayOvertime += 1;
      } else if (remaining <= 5) {
        bayNearly += 1;
      } else {
        bayOnTime += 1;
      }
    });
  });

  return {
    activeBay: {
      total: activeBay.total_bays || 0,
      staffed: activeBay.staffed_bays || 0
    },
    pendingToday: pendingTodayRes.rows[0]?.count || 0,
    checkinCount: checkinRes.rows[0]?.count || 0,
    completedCount: completedRes.rows[0]?.count || 0,
    backlogCount,
    bayStatus: {
      total: bayTotal,
      empty: bayEmpty,
      onTime: bayOnTime,
      nearly: bayNearly,
      overtime: bayOvertime
    },
    activeBay: {
      total: bayTotal,
      staffed: bayTotal - bayEmpty
    }
  };
};

const getTasksList = async (req, data) => {

  const query = `
    SELECT m.* , m2.type , c.status , b.name , sum(t.price) as total , sum(t.duration) as duration,
    c.checkout_time , c.remark,  c.checkin_time,
    (EXTRACT(EPOCH FROM (c.checkout_time - c.created_at)) / 60)::int AS diff_minutes  FROM masterlist m 
  LEFT JOIN (SELECT TRIM(type)as type , masterlist_id FROM task_item WHERE (TRIM(type) = 'FITMENT' 
  OR TRIM(type) = 'HOIST') GROUP BY TRIM(type) ,masterlist_id) m2 ON m2.masterlist_id = m.no
  LEFT JOIN checkin c ON m.no = c.masterlist_id AND c.type = m2.type
  LEFT JOIN bay b ON b.no = c.bay_id
  LEFT JOIN task_item t ON t.masterlist_id = m.no AND t.type = m2.type
  GROUP BY c.status , b.name , m.no , c.created_at ,  c.checkout_time , c.remark , c.checkin_time, m2.type
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

const getTasksList2 = async (req, data) => {
  const masterFilters = [];
  const joinFilters = [];
  const values = [];
  let paramIndex = 1;

  const addMaster = (cond, vals = []) => {
    const placeholders = vals.map(() => `$${paramIndex++}`);
    masterFilters.push(cond(placeholders));
    values.push(...vals);
  };

  const addJoin = (cond, vals = []) => {
    const placeholders = vals.map(() => `$${paramIndex++}`);
    joinFilters.push(cond(placeholders));
    values.push(...vals);
  };

  // Base cancel filter
  masterFilters.push('cancel_time IS NULL');

  // Text filters (master)
  if (data.chassis) addMaster((p) => `chassis ILIKE ${p[0]}`, [`%${data.chassis}%`]);
  if (data.fitment_id) addMaster((p) => `fitment_id ILIKE ${p[0]}`, [`%${data.fitment_id}%`]);
  if (data.model) addMaster((p) => `model_description ILIKE ${p[0]}`, [`%${data.model}%`]);
  if (data.seq) addMaster((p) => `seq = ${p[0]}`, [Number(data.seq)]);

  // Status (checkin table)
  if (data.status && data.status !== 'All') addJoin((p) => `c.status ILIKE ${p[0]}`, [`%${data.status}%`]);

  // Type (task_item)
  if (data.type && data.type !== 'All') addJoin((p) => `m2.type = ${p[0]}`, [data.type]);

  // Date range
  const today = new Date().toISOString().slice(0, 10);
  const dateFrom = data.date_from || today;
  const dateTo = data.date_to || dateFrom;
  const dateField = data.date_field === 'checkin' ? 'c.checkin_time' : 'm.cafi_date';
  if (dateField === 'c.checkin_time') {
    addJoin((p) => `${dateField}::date BETWEEN ${p[0]}::date AND ${p[1]}::date`, [dateFrom, dateTo]);
  } else {
    addMaster((p) => `cafi_date::date BETWEEN ${p[0]}::date AND ${p[1]}::date`, [dateFrom, dateTo]);
  }

  const cteFilters = masterFilters;

  let query = `
    WITH filtered_master AS (
      SELECT * FROM masterlist
      WHERE ${cteFilters.join(' AND ')}
    )
    SELECT 
      m.no,
      m.model_code,
      m.chassis,
      m.model_description,
      m.seq,
      m.fitment_id,
      m.colour,
      to_char(DATE(m.cafi_date), 'YYYY-MM-DD') AS cafi_date,
      to_char(DATE(m.caout_date), 'YYYY-MM-DD') AS caout_date,
      m.accessories_std,
      json_agg (json_build_object('short_name' , t.short_name)) as accessories,
      m2.type, 
      c.status, 
      b.name AS bay_name, 
      SUM(t.price) AS total, 
      SUM(t.duration) AS duration,
      c.checkout_time, 
      c.checkin_time, 
      c.remark,
       CASE 
        WHEN c.checkin_time IS NOT NULL AND c.checkout_time IS NOT NULL 
        THEN EXTRACT(EPOCH FROM (c.checkout_time - c.checkin_time)) / 60
        ELSE NULL
    END AS diff_minutes
    FROM filtered_master m 
    LEFT JOIN (
      SELECT 
        TRIM(type) AS type, 
        masterlist_id 
      FROM task_item 
      WHERE TRIM(type) IN ('FITMENT', 'HOIST')
      GROUP BY TRIM(type), masterlist_id 
    ) m2 ON m2.masterlist_id = m.no
    LEFT JOIN checkin c 
      ON m.no = c.masterlist_id 
      AND c.type = m2.type
    LEFT JOIN bay b 
      ON b.no = c.bay_id
    LEFT JOIN task_item t 
      ON t.masterlist_id = m.no 
      AND t.type = m2.type
  `;

  // 🔹 Grouping
  query += `
    GROUP BY 
      m.no,
      m.model_code,
      m.chassis,
      m.model_description,
      m.seq,
      m.fitment_id,
      m.colour,
      m.cafi_date,
      m.caout_date,
      m.accessories_std,
      m2.type,
      c.status,
      b.name,
      c.created_at,
      c.checkout_time,
      c.checkin_time, 
      c.remark
  `;

  if (joinFilters.length > 0) {
    query += ` HAVING ${joinFilters.join(' AND ')}`;
  }

  // 🔹 Ordering + pagination
  const limit = Number(data?.limit) || 50;
  const offset = Number(data?.offset) || 0;
  query += `
    ORDER BY ${dateField} DESC, m.no ASC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;
  values.push(limit, offset);
  paramIndex += 2;

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

  // 🔹 STATUS FILTER — FIXED
  if (data.status && data.status !== 'All') {
    filters.push(`c.status = $${i++}`);
    values.push(data.status);
  }

  // 🔹 Date range filter
  const today = new Date().toISOString().slice(0, 10);
  const dateFrom = data.date_from || today;
  const dateTo = data.date_to || dateFrom;
  filters.push(`m.cafi_date::date BETWEEN $${i}::date AND $${i+1}::date`);
  values.push(dateFrom, dateTo);
  i += 2;

  // 🔹 CTE Query
  let query = `
    WITH selectdata AS (
      SELECT 
        c.status
      FROM masterlist m 
      LEFT JOIN (
        SELECT TRIM(type) AS type, masterlist_id 
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
    WHERE status IS NOT NULL
    GROUP BY status;
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

const getLastOpenCafiDate = async (req) => {
  const query = `
    SELECT cafi_date
    FROM masterlist
    WHERE caout_date IS NULL
    ORDER BY cafi_date ASC
    LIMIT 1
  `;

  const result = await req.app.get('pool').query(query);
  return result.rows[0]?.cafi_date || null;
};

const getTaskbyNoandType = async (req, no , type ) => {

  const query = `
  SELECT * FROM task_item WHERE masterlist_id = $1  AND type = $2
  `;
  const values = [
    no , type
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows
};

const getTaskbyNo = async (req, no ) => {

  const query = `
  SELECT * FROM task_item WHERE masterlist_id = $1  AND type IN ('FITMENT' , 'HOIST')
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

const getCheckInByMasterNo = async (req, no) => {

  const query = `
 SELECT c.* , b.name ,  json_agg (json_build_object('short_name' , t.short_name)) as accessories  FROM checkin c
    LEFT JOIN bay b ON b.no = c.bay_id
	LEFT JOIN task_item t ON t.masterlist_id = c.masterlist_id AND t.type = c.type
  WHERE c.masterlist_id = $1 GROUP BY c.no , b.name
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
    SELECT 
    c.*,
    b.name,
    
    -- Staff list without duplicates
    COALESCE(
        jsonb_agg(DISTINCT jsonb_build_object(
            'name', s.name,
            'type', s.type,
            'photo', s.photo
        )) FILTER (WHERE s.no IS NOT NULL),
        '[]'::jsonb
    ) AS staff,

    -- Accessories list without duplicates
    COALESCE(
        jsonb_agg(DISTINCT jsonb_build_object(
            'short_name', t.short_name
        )) FILTER (WHERE t.short_name IS NOT NULL),
        '[]'::jsonb
    ) AS accessories

FROM checkin c
LEFT JOIN bay b 
    ON b.no = c.bay_id
LEFT JOIN checkin_staff c2 
    ON c2.checkin_id = c.no
LEFT JOIN staff s 
    ON s.no = c2.staff_id
LEFT JOIN task_item t 
    ON t.masterlist_id = c.masterlist_id 
    AND t.type = c.type

WHERE c.masterlist_id = $1

GROUP BY 
    c.no, 
    b.name;

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

const getStandyList = async (req , type ) => {

  const query = `
 SELECT 
    m.chassis, 
    m.fitment_id,
    c.type,
    c.created_at,
    b.name,
    c.status,
    m.colour,
    m.model_description,
    c.status,
    m.seq,
    c.no,
    c.accessory_status,
    c.accessory_pickup
FROM checkin c
LEFT JOIN masterlist m 
    ON m.no = c.masterlist_id
LEFT JOIN bay b 
    ON b.no = c.bay_id
LEFT JOIN specialacc s 
    ON m.model_code = s.model_code 
    AND m.model_description = s.model_description 
    AND m.colour = s.color_code
WHERE 
(    (
        c.type = 'FITMENT' AND    $1 = 'FITMENT'  -- FITMENT: no need specialacc
    )
    OR (
        c.type = 'HOIST' AND    $1 = 'HOIST'    -- HOIST: must match specialacc
        AND s.model_code IS NOT NULL
    )) AND accessory_status != 'Completed'
ORDER BY 
    c.no ASC;
  `;
  const values = [type];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows
};

const updatePickup = async (req, no) => {

  const query = `UPDATE checkin SET  accessory_pickup = $1 , accessory_status = 'Completed' WHERE no = $2 RETURNING *`;

  const values = [
    new Date() ,  no
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows[0];
};

const updateReady = async (req, no) => {

  const query = `UPDATE checkin SET accessories = $1 , accessory_status = 'Ready' WHERE no = $2 RETURNING *`;

  const values = [
    new Date() ,  no
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows[0];
};

const updatePickupTime = async (req, no) => {

  const query = `UPDATE checkin SET checkin_time = $1 WHERE no = $2 RETURNING *`;

  const values = [
    new Date() ,  no
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows[0];
};

const getPickUpList = async (req) => {

  const query = `SELECT c.no , c.created_at , m.fitment_id , m.chassis , b.name,
 json_agg(
      json_build_object('nick_name' , s.nick_name)) as staff
FROM checkin c 
LEFT JOIN masterlist m  ON m.no = c.masterlist_id
LEFT JOIN checkin_staff c2 ON c2.checkin_id = c.no
LEFT JOIN staff s ON s.no = c2.staff_id
LEFT JOIN bay b ON b.no = c.bay_id
WHERE status = 'Check-In' AND checkin_time IS null
GROUP BY  c.created_at , m.fitment_id , m.chassis , c.no , b.name`;

  const values = [

  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows;
};

const getStandbyList = async (req) => {

  const query = `SELECT b.name,  c.* , m.chassis , m.fitment_id , m.model_description , m.colour FROM checkin c 
  LEFT JOIN masterlist m ON m.no = c.masterlist_id
  LEFT JOIN bay b ON b.no = c.bay_id
  WHERE c.status = 'Standby'`;

  const values = [

  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows;
};

const getCheckINByNo = async (req , no) => {

  const query = `SELECT * FROM checkin WHERE no = $1`;

  const values = [
    no
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows[0];
};

const getFitmentCurrentCheckin = async (req) => {

  const query = `WITH checkin_summary AS (
  SELECT 
    b.name AS bay_name,
    m.chassis,
    c.checkin_time,
	m.fitment_id ,
	m.model_description,
    COALESCE(SUM(t.duration), 0) AS total_duration
  FROM bay b
  LEFT JOIN checkin c 
    ON c.bay_id = b.no 
    AND c.status = 'Check-In'
  LEFT JOIN masterlist m 
    ON m.no = c.masterlist_id
  LEFT JOIN task_item t 
    ON t.masterlist_id = m.no 
    AND t.type = c.type
  GROUP BY b.name, m.chassis, c.checkin_time ,m.fitment_id ,m.model_description
)
SELECT 
  bay_name,
  json_agg(
    json_build_object(
      'chassis', chassis,
      'duration', total_duration,
      'checkin_time', checkin_time,
	 'fitment_id', fitment_id ,
	 'model_description',model_description
    )
    ORDER BY (checkin_time - (total_duration || ' minutes')::interval)
  ) AS checkin_detail
FROM checkin_summary
GROUP BY bay_name
ORDER BY MIN(checkin_time - (total_duration || ' minutes')::interval);

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

const getCollectScreen = async (req ) => {

  const query = `SELECT 
    LEFT(b.name, 1) AS bay_group,
    json_agg(
        json_build_object(
            'bay', b.name,
            'accessory_status', (
                SELECT c.accessory_status
                FROM checkin c
                WHERE c.bay_id = b.no
                AND c.accessory_status != 'Completed'
                LIMIT 1
            )
        )
        ORDER BY b.name
          ) AS bays
      FROM bay b WHERE LEFT(b.name, 1) != 'E'
      GROUP BY bay_group
      ORDER BY bay_group;
      `;

  const values = [  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows;
};

const getCurrentCheckin = async (req ) => {

  const query = `SELECT 
    LEFT(b.name, 1) AS bay_group,
    json_agg(
        json_build_object(
            'bay', b.name,
            'fitment_id', first_checkin.fitment_id,
            'checkin_time', first_checkin.checkin_time,
			'checkin_id', first_checkin.no,
            'total_checkin', total_checkin.count_checkin,
			'masterlist_id', first_checkin.master_id,
     		'type', first_checkin.type,
			 'totalduration' , first_checkin.totalduration
       
        )
        ORDER BY b.name
    ) AS bays
FROM bay b

-- Get FIRST (oldest) check-in per bay
LEFT JOIN LATERAL (
    SELECT 
       c.checkin_time,
               c.type,
        m.fitment_id,
		m.no as master_id,
		c.no,
		sum( COALESCE(t.duration , 0) ) as totalduration
    FROM checkin c
    LEFT JOIN masterlist m ON m.no = c.masterlist_id
	LEFT JOIN task_item t ON t.masterlist_id = c.masterlist_id AND t.type = c.type
    WHERE c.bay_id = b.no 
      AND c.status = 'Check-In'
	  GROUP BY c.checkin_time ,   c.type,
        m.fitment_id,m.no, c.no
    ORDER BY c.checkin_time ASC
    LIMIT 1
) AS first_checkin ON TRUE

-- Count total check-ins per bay
LEFT JOIN LATERAL (
    SELECT COUNT(*) AS count_checkin
    FROM checkin c2
    WHERE c2.bay_id = b.no 
      AND c2.status = 'Check-In'
) AS total_checkin ON TRUE
WHERE LEFT(b.name, 1) != 'E'
GROUP BY bay_group
ORDER BY bay_group;
      `;

  const values = [  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows;
};

const getPickCheckin = async (req ) => {

  const query = `SELECT 
    LEFT(b.name, 1) AS bay_group,
    json_agg(
        json_build_object(
            'bay', b.name,
            'fitment_id', first_checkin.fitment_id,
            'checkin_time', first_checkin.checkin_time,
			'checkin_id', first_checkin.no,
            'total_checkin', total_checkin.count_checkin,
			 'masterlist_id', first_checkin.master_id,
     'type', first_checkin.type
       
        )
        ORDER BY b.name
    ) AS bays
FROM bay b
-- Get FIRST (oldest) check-in per bay
LEFT JOIN LATERAL (
    SELECT 
        c.checkin_time,
               c.type,
        m.fitment_id,
		m.no as master_id,
		c.no
    FROM checkin c
    LEFT JOIN masterlist m ON m.no = c.masterlist_id
    WHERE c.bay_id = b.no 
      AND c.status = 'Check-In' AND c.checkin_time is NULL
    ORDER BY c.checkin_time ASC
    LIMIT 1
) AS first_checkin ON TRUE

-- Count total check-ins per bay
LEFT JOIN LATERAL (
    SELECT COUNT(*) AS count_checkin
    FROM checkin c2
    WHERE c2.bay_id = b.no 
      AND c2.status = 'Check-In' AND c2.checkin_time is NULL
) AS total_checkin ON TRUE
WHERE LEFT(b.name, 1) != 'E'
GROUP BY bay_group
ORDER BY bay_group;
      `;

  const values = [  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows;
};

const getBayCurrentCheckin = async (req , bay ) => {

  // console.log(bay)

  const query = `
SELECT 
    c.checkin_time,
    m.fitment_id,
    m.model_code,
    m.chassis,
    m.model_description,
    m.no as masterlist_id,
    c.remark,
    c.no AS checkin_id,
    c.type as checkin_type,
    SUM(t.duration) AS total_duration,

    -- DISTINCT staff list subquery
    (
        SELECT json_agg(
            json_build_object(
                'name', s.name,
                'nick_name', s.nick_name
            )
        )
        FROM checkin_staff cs
        LEFT JOIN staff s ON s.no = cs.staff_id
        WHERE cs.checkin_id = c.no
    ) AS staff_list

FROM bay b
LEFT JOIN checkin c ON c.bay_id = b.no
LEFT JOIN masterlist m ON m.no = c.masterlist_id
LEFT JOIN task_item t ON t.masterlist_id = m.no

WHERE b.name = $1 AND c.status != 'Check-Out'

GROUP BY 
    c.checkin_time,
    m.fitment_id,
    m.model_code,
    m.chassis,
    m.model_description,
    c.remark,
    c.no,
    c.type,
      m.no 
      `;

  const values = [ bay ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows;
};

const getCheckinByNoandType = async (req , master_id , type ) => {

  const query = `
  SELECT 
    c.checkin_time,
	  b.name as bay_name,
    m.fitment_id,
    m.model_code,
    m.chassis,
    m.model_description,
    c.remark,
    c.no AS checkin_id,
        c.status,
    total_task.total_duration,
    staff_list.staffs

FROM checkin c
JOIN masterlist m ON m.no = c.masterlist_id
LEFT JOIN bay b ON b.no = c.bay_id

-- total task duration (aggregate in lateral subquery)
LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(t.duration), 0) AS total_duration
    FROM task_item t
    WHERE t.masterlist_id = m.no
) AS total_task ON TRUE

-- distinct staff list (aggregate in lateral subquery)
LEFT JOIN LATERAL (
    SELECT json_agg(
        DISTINCT jsonb_build_object(
            'name', s.name,
            'nick_name', s.nick_name,
            'no' , s.no,
            'checkin_staff_no', cs.no
        )
    ) AS staffs
    FROM checkin_staff cs
    LEFT JOIN staff s ON s.no = cs.staff_id
    WHERE cs.checkin_id = c.no
) AS staff_list ON TRUE

WHERE 
    m.no = $1
    AND c.type = $2;

      `;

  const values = [ master_id , type ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows;
};

const getCheckinByNo = async (req , master_id  ) => {

  const query = `
 SELECT 
    c.*,
    b.name,
    
    -- Staff list without duplicates
    COALESCE(
        jsonb_agg(DISTINCT jsonb_build_object(
            'name', s.nick_name,
            'type', s.type,
            'photo', s.photo
        )) FILTER (WHERE s.no IS NOT NULL),
        '[]'::jsonb
    ) AS staff,

    -- Accessories list without duplicates
    COALESCE(
        jsonb_agg(DISTINCT jsonb_build_object(
            'short_name', t.short_name
        )) FILTER (WHERE t.short_name IS NOT NULL),
        '[]'::jsonb
    ) AS accessories

FROM checkin c
LEFT JOIN bay b 
    ON b.no = c.bay_id
LEFT JOIN checkin_staff c2 
    ON c2.checkin_id = c.no
LEFT JOIN staff s 
    ON s.no = c2.staff_id
LEFT JOIN task_item t 
    ON t.masterlist_id = c.masterlist_id 
    AND t.type = c.type

WHERE c.masterlist_id = $1

GROUP BY 
    c.no, 
    b.name;

      `;

  const values = [ master_id  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows;
};

const getStaffTaskList = async (req , month , staff_id) => {

  const query = `SELECT 
    c.no AS checkin_id,
    c.checkin_time,
    m.fitment_id,
    m.chassis,
    c.type,
	b.name as bay_name,
    SUM(t.duration) AS total_duration,
    SUM(t.price) AS total_price,

    json_agg(
      DISTINCT jsonb_build_object(
        'short_name', t.short_name
      )
    ) AS task,

    json_agg(
      DISTINCT jsonb_build_object(
        'staff_id', s2.no,
        'nick_name', s2.nick_name
      )
    ) AS staffList

FROM checkin c
LEFT JOIN masterlist m 
  ON m.no = c.masterlist_id
LEFT JOIN task_item t 
  ON t.masterlist_id = m.no 
 AND t.type = c.type
LEFT JOIN checkin_staff s 
  ON s.checkin_id = c.no
LEFT JOIN bay b
  ON b.no = c.bay_id
LEFT JOIN staff s2 
  ON s2.no = s.staff_id

WHERE c.checkin_time >= $1
  AND c.checkin_time < ($1::date + INTERVAL '1 month')

  -- ✅ filter checkin, not staff row
  AND EXISTS (
    SELECT 1
    FROM checkin_staff cs
    WHERE cs.checkin_id = c.no
      AND cs.staff_id = $2
  )

GROUP BY
    c.no,
    c.checkin_time,
    m.fitment_id,
    m.chassis,
    c.type,
	b.name

ORDER BY c.checkin_time;


`;

  const values = [
    month , staff_id
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows;
};

const deleteCheckStaff = async (req,  checkin_id  ) => {

  const query = `DELETE FROM checkin_staff WHERE checkin_id = $1 RETURNING *`;

  const values = [
    checkin_id
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows[0];
};

const standbyHistory = async (req, dateFrom, dateTo) => {

  console.log(dateFrom, dateTo)

  const query = `SELECT c.type , c.accessory_status  , c.accessories , c.accessory_pickup, c.created_at ,
m.fitment_id , b.name
FROM checkin c 
LEFT JOIN masterlist m ON c.masterlist_id = m.no
LEFT JOIN bay b ON b.no = c.bay_id
WHERE c.accessories::date BETWEEN $1::date AND $2::date
ORDER BY accessories DESC`;

  const values = [
    dateFrom,
    dateTo
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows;
};

// Bulk cancel masterlist entries by CAFI date and seq range
const cancelMasterlistByRange = async (req, date, seqFrom, seqTo, remark, cancelTime = new Date()) => {
  const query = `
    UPDATE masterlist
    SET cancel_time = $4, cancel_remark = $5
    WHERE cafi_date::date = $1::date
      AND seq BETWEEN $2 AND $3
    RETURNING *`;

  const values = [date, seqFrom, seqTo, cancelTime, remark];

  const result = await req.app.get('pool').query(query, values);
  return result.rows;
};


const inactiveMaster = async (req  , status , cancel_remark  , no) => {

  const query = `UPDATE masterlist SET status = $1 , cancel_remark = $2 , cancel_time = $3 WHERE no = $4`;

  const values = [
    status , cancel_remark , new Date() , no
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows;
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
  deleteCheckinStaff,
  getStandyList,
  updatePickup,
  getPickUpList,
  updatePickupTime,
  getCheckInList2,
  updateCheckInRemark,
  getStandbyList,
  updateCheckInNew,
  getCheckINByNo,
  getFitmentCurrentCheckin,
  updateReady,
  getCollectScreen,
  getCurrentCheckin,
  getBayCurrentCheckin,
  searchMasterlistByno,
  findMasterByChassisSeq,
  findStaffNosByStaffIds,
  insertManualCheckIn,
  getTaskbyNoandType,
  getCheckinByNoandType,
  getCheckinByNo,
  getTaskbyNo,
  getStaffTaskList,
  deleteCheckStaff,
  getPickCheckin,
  standbyHistory,
  getLastOpenCafiDate,
  cancelMasterlistByRange,
  inactiveMaster,
  getMasterBacklogCount,
  getTasksBacklogCount,
  getDashboardStats,
  insertCheckInStaffBatch
};
