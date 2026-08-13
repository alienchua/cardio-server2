require('dotenv').config();

const getQueryRunner = (req, client) => client || req.app.get('pool');

const insertMasterlist = async (req, data, client = null) => {

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

    const result = await getQueryRunner(req, client).query(
      query,
      values
    );
    // const res = await req.query(query, values);
    return {
      id:  result.rows[0].no , // depending on your table structure
      operation:   result.rows[0].operation
    };

}

const insertTaskItem = async (req, data, client = null) => {

  const query = `
    INSERT INTO task_item (masterlist_id, accessories_id, price, duration, type, short_name)
    VALUES ($1,$2,$3,$4,$5,$6)
  `;

  // console.log( data.masterlist_id, data.accessories_id, data.price, data.duration, data.type, data.short_name)
  const values = [
    data.masterlist_id, data.accessories_id, data.price, data.duration, data.type, data.short_name
  ];

  const result = await getQueryRunner(req, client).query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows[0];
};

const insertCheckIN = async (req, masterlist_id, action_by, bay_id, status, type) => {
  let query;
  let values;

  if(bay_id == 41){

    query = `
    INSERT INTO checkin (masterlist_id, action_by, bay_id, status, type, accessory_status, checkin_time , checkout_time)
    VALUES ($1, $2, $3, $4, $5, 'Pending', $6, $6)
    RETURNING *
  `;
  values = [masterlist_id, action_by, bay_id, 'Check-Out', type, new Date(),];

  }
  else if (type === 'FITMENT') {

    query = `
      INSERT INTO checkin (masterlist_id, action_by, bay_id, status, type, accessory_status)
      VALUES ($1, $2, $3, $4, $5, 'Pending')
      RETURNING *
    `;
    values = [masterlist_id, action_by, bay_id, status, type];

  } else {

    query = `
      INSERT INTO checkin (masterlist_id, action_by, bay_id, status, type, accessory_status, checkin_time)
      VALUES ($1, $2, $3, $4, $5, 'Pending', $6)
      RETURNING *
    `;
    values = [masterlist_id, action_by, bay_id, status, type, new Date()];

  }

  const result = await req.app.get('pool').query(query, values);
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

  const query = `SELECT * FROM masterlist WHERE  LOWER(fitment_id)  = LOWER($1) LIMIT 1`;

  const values = [
     seq
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows[0];
};

const getSpecialCarModelCodes = async (req) => {
  const query = `
    SELECT special_car
    FROM settings
    ORDER BY 1
    LIMIT 1
  `;

  const result = await req.app.get('pool').query(query);
  const rawValue = result.rows?.[0]?.special_car;

  if (!rawValue) {
    return [];
  }

  try {
    const parsed = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item || '').trim().toUpperCase()).filter(Boolean)
      : [];
  } catch (error) {
    console.error('[getSpecialCarModelCodes] Failed to parse settings.special_car', error);
    return [];
  }
};

const getSpecialCarModels = async (req) => {
  const query = `
    SELECT
      a.model_code,
      a.model,
      a.model_description
    FROM accessories a
    WHERE a.model_code IN (
      SELECT jsonb_array_elements_text(s.special_car)
      FROM settings s
      WHERE s.special_car IS NOT NULL
        AND jsonb_typeof(s.special_car) = 'array'
    )
    GROUP BY a.model_code, a.model, a.model_description
    ORDER BY a.model_code, a.model, a.model_description
  `;

  const result = await req.app.get('pool').query(query);
  return result.rows;
};

const updateSpecialCarModelCodes = async (req, specialCars) => {
  const serialized = JSON.stringify(specialCars || []);

  const updateQuery = `
    UPDATE settings
    SET special_car = $1
    RETURNING special_car
  `;

  const updateResult = await req.app.get('pool').query(updateQuery, [serialized]);

  if (updateResult.rowCount > 0) {
    return Array.isArray(specialCars) ? specialCars : [];
  }

  const insertQuery = `
    INSERT INTO settings (special_car)
    VALUES ($1)
    RETURNING special_car
  `;

  await req.app.get('pool').query(insertQuery, [serialized]);
  return Array.isArray(specialCars) ? specialCars : [];
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

const findMasterlistByChassisFitment = async (req, chassis, fitment_id) => {
  const query = `
    SELECT *
    FROM masterlist
    WHERE chassis = $1 AND fitment_id = $2
    LIMIT 1
  `;

  const values = [chassis, fitment_id];
  const result = await req.app.get('pool').query(query, values);
  return result.rows[0];
};

const findMasterlistsByFitmentIds = async (req, fitmentIds = []) => {
  const normalizedFitmentIds = [...new Set((fitmentIds || [])
    .map((id) => String(id || '').trim().toLowerCase())
    .filter(Boolean))];

  if (normalizedFitmentIds.length === 0) {
    return [];
  }

  const query = `
    SELECT
      m.*,
      COUNT(DISTINCT t.no)::int AS task_item_count,
      COUNT(DISTINCT c.no)::int AS checkin_count,
      COUNT(DISTINCT o.no)::int AS task_offset_count
    FROM masterlist m
    LEFT JOIN task_item t ON t.masterlist_id = m.no
    LEFT JOIN checkin c ON c.masterlist_id = m.no
    LEFT JOIN task_offset o ON o.masterlist_id = m.no
    WHERE LOWER(TRIM(m.fitment_id)) = ANY($1::text[])
      AND m.cancel_time IS NULL
    GROUP BY m.no
  `;

  const result = await req.app.get('pool').query(query, [normalizedFitmentIds]);
  return result.rows;
};

const deleteMasterlistWithTaskItems = async (req, masterlistId, client = null) => {
  const db = getQueryRunner(req, client);

  await db.query('DELETE FROM task_item WHERE masterlist_id = $1', [masterlistId]);
  await db.query('DELETE FROM task_offset WHERE masterlist_id = $1', [masterlistId]);
  const result = await db.query('DELETE FROM masterlist WHERE no = $1 RETURNING *', [masterlistId]);
  return result.rows[0];
};

const updateMasterlistFromImport = async (req, masterlistId, data, client = null) => {
  const db = getQueryRunner(req, client);
  const query = `
    UPDATE masterlist
    SET chassis = $1,
        seq = $2,
        fitment_id = $3,
        model_code = $4,
        model_description = $5,
        colour = $6,
        accessories_std = $7,
        accessories_otp = $8,
        accessories_full = $9,
        caout_date = $10,
        caout_time = $11,
        cafi_date = $12,
        cancel_time = NULL,
        cancel_remark = NULL,
        status = 'Active'
    WHERE no = $13
    RETURNING *
  `;

  const values = [
    data.chassis,
    data.seq,
    data.fitment_id,
    data.model_code,
    data.model_description,
    data.colour,
    data.accessories_std,
    data.accessories_otp,
    data.accessories_full,
    data.caout_date,
    data.caout_time,
    data.cafi_date,
    masterlistId
  ];

  const result = await db.query(query, values);
  return result.rows[0];
};

const deleteTaskItemsByMasterlist = async (req, masterlistId, client = null) => {
  const db = getQueryRunner(req, client);
  const result = await db.query('DELETE FROM task_item WHERE masterlist_id = $1 RETURNING *', [masterlistId]);
  return result.rows;
};

const deleteTaskOffsetsByMasterlist = async (req, masterlistId, client = null) => {
  const db = getQueryRunner(req, client);
  const result = await db.query('DELETE FROM task_offset WHERE masterlist_id = $1 RETURNING *', [masterlistId]);
  return result.rows;
};

const cancelCheckinsByMasterlist = async (req, masterlistId, actionBy, remark, client = null) => {
  const db = getQueryRunner(req, client);
  const archiveQuery = `
    INSERT INTO cencellcheckin (
      masterlist_id,
      action_by,
      checkin_id,
      bay_id,
      status,
      created_at,
      checkout_time,
      remark,
      type,
      checkin_time,
      accessory_status,
      accessory_pickup,
      showaccessories,
      preparing_time
    )
    SELECT
      masterlist_id,
      $2,
      no,
      bay_id,
      status,
      created_at,
      checkout_time,
      $3,
      type,
      checkin_time,
      accessory_status,
      accessory_pickup,
      showaccessories,
      preparing_time
    FROM checkin
    WHERE masterlist_id = $1
    RETURNING *
  `;

  const archiveResult = await db.query(archiveQuery, [masterlistId, actionBy, remark]);
  await db.query(`
    DELETE FROM checkin_staff
    WHERE checkin_id IN (
      SELECT no
      FROM checkin
      WHERE masterlist_id = $1
    )
  `, [masterlistId]);
  const deleteResult = await db.query('DELETE FROM checkin WHERE masterlist_id = $1 RETURNING *', [masterlistId]);

  return {
    archived: archiveResult.rows,
    deleted: deleteResult.rows
  };
};

const cancelMasterlistForReplacement = async (req, masterlistId, remark, client = null) => {
  const db = getQueryRunner(req, client);
  const query = `
    UPDATE masterlist
    SET cancel_time = $1,
        cancel_remark = $2,
        status = 'Inactive'
    WHERE no = $3
    RETURNING *
  `;

  const result = await db.query(query, [new Date(), remark, masterlistId]);
  return result.rows[0];
};

const updateMasterlistAccessoryFields = async (req, masterlist_id, data) => {
  const query = `
    UPDATE masterlist
    SET accessories_std = $1,
        accessories_otp = $2,
        accessories_full = $3
    WHERE no = $4
    RETURNING *
  `;

  const values = [
    data.accessories_std || null,
    data.accessories_otp || null,
    data.accessories_full || null,
    masterlist_id
  ];

  const result = await req.app.get('pool').query(query, values);
  return result.rows[0];
};

const findTaskItemByMasterAccessory = async (req, masterlist_id, accessories_id) => {
  const query = `
    SELECT *
    FROM task_item
    WHERE masterlist_id = $1 AND accessories_id = $2
    LIMIT 1
  `;

  const values = [masterlist_id, accessories_id];
  const result = await req.app.get('pool').query(query, values);
  return result.rows[0];
};

const updateMasterlistRemark = async (req, masterlist_id, remark) => {
  const query = `
    UPDATE masterlist
    SET remark = $1
    WHERE no = $2
    RETURNING *
  `;

  const values = [remark, masterlist_id];
  const result = await req.app.get('pool').query(query, values);
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

const createManualTaskCheckin = async (req, payload) => {
  const {
    masterlist_id,
    action_by,
    bay_id,
    type,
    checkin_time,
    checkout_time,
    remark,
    staff_ids = []
  } = payload;

  const client = await req.app.get('pool').connect();

  try {
    await client.query('BEGIN');

    const insertCheckinQuery = `
      INSERT INTO checkin (
        masterlist_id,
        action_by,
        bay_id,
        status,
        type,
        accessory_status,
        checkin_time,
        checkout_time,
        remark
      )
      VALUES ($1, $2, $3, 'Check-Out', $4, 'Pending', $5, $6, $7)
      RETURNING *
    `;

    const insertCheckinValues = [
      masterlist_id,
      action_by,
      bay_id,
      type,
      checkin_time,
      checkout_time,
      remark || null
    ];

    const checkinResult = await client.query(insertCheckinQuery, insertCheckinValues);
    const checkin = checkinResult.rows[0];

    const normalizedStaffIds = Array.from(
      new Set((staff_ids || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))
    );

    let insertedStaff = [];
    if (normalizedStaffIds.length > 0) {
      const insertStaffQuery = `
        INSERT INTO checkin_staff (checkin_id, staff_id, position)
        SELECT $1, s.no, s.type
        FROM staff s
        WHERE s.no = ANY($2::int[])
        RETURNING *
      `;
      const insertStaffResult = await client.query(insertStaffQuery, [checkin.no, normalizedStaffIds]);
      insertedStaff = insertStaffResult.rows;

      if (insertedStaff.length !== normalizedStaffIds.length) {
        const err = new Error('Some selected staff were not found');
        err.status = 400;
        throw err;
      }
    }

    await client.query('COMMIT');

    return {
      checkin,
      staff: insertedStaff
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const upsertManualTaskCheckin = async (req, payload) => {
  const {
    existing_checkin_id,
    masterlist_id,
    action_by,
    bay_id,
    type,
    checkin_time,
    checkout_time,
    remark,
    staff_ids = []
  } = payload;

  const client = await req.app.get('pool').connect();

  try {
    await client.query('BEGIN');

    let checkin;

    if (existing_checkin_id) {
      const updateCheckinQuery = `
        UPDATE checkin
        SET bay_id = $2,
            status = 'Check-Out',
            type = $3,
            action_by = $4,
            accessory_status = 'Pending',
            checkin_time = $5,
            checkout_time = $6,
            remark = $7
        WHERE no = $1
        RETURNING *
      `;

      const updateCheckinValues = [
        existing_checkin_id,
        bay_id,
        type,
        action_by,
        checkin_time,
        checkout_time,
        remark || null
      ];

      const updateCheckinResult = await client.query(updateCheckinQuery, updateCheckinValues);

      if (updateCheckinResult.rowCount === 0) {
        const err = new Error('Check-in record not found');
        err.status = 404;
        throw err;
      }

      checkin = updateCheckinResult.rows[0];
      await client.query(`DELETE FROM checkin_staff WHERE checkin_id = $1`, [existing_checkin_id]);
    } else {
      const insertCheckinQuery = `
        INSERT INTO checkin (
          masterlist_id,
          action_by,
          bay_id,
          status,
          type,
          accessory_status,
          checkin_time,
          checkout_time,
          remark
        )
        VALUES ($1, $2, $3, 'Check-Out', $4, 'Pending', $5, $6, $7)
        RETURNING *
      `;

      const insertCheckinValues = [
        masterlist_id,
        action_by,
        bay_id,
        type,
        checkin_time,
        checkout_time,
        remark || null
      ];

      const checkinResult = await client.query(insertCheckinQuery, insertCheckinValues);
      checkin = checkinResult.rows[0];
    }

    const normalizedStaffIds = Array.from(
      new Set((staff_ids || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))
    );

    let insertedStaff = [];
    if (normalizedStaffIds.length > 0) {
      const insertStaffQuery = `
        INSERT INTO checkin_staff (checkin_id, staff_id, position)
        SELECT $1, s.no, s.type
        FROM staff s
        WHERE s.no = ANY($2::int[])
        RETURNING *
      `;
      const insertStaffResult = await client.query(insertStaffQuery, [checkin.no, normalizedStaffIds]);
      insertedStaff = insertStaffResult.rows;

      if (insertedStaff.length !== normalizedStaffIds.length) {
        const err = new Error('Some selected staff were not found');
        err.status = 400;
        throw err;
      }
    }

    await client.query('COMMIT');

    return {
      checkin,
      staff: insertedStaff
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
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
  console.log(masterlist_id , type )

  // console.log(masterlist_id , type)
  const query = `UPDATE checkin SET status = 'Check-Out' , checkout_time = $1  WHERE no = $2  RETURNING *`;

  const values = [
    new Date() ,  masterlist_id  
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows[0];
};

const updateCheckInNew = async (req, no , bay_id ) => {
  const query = `UPDATE checkin
    SET status = 'Check-In',
        bay_id = $2,
        checkin_time = CURRENT_TIMESTAMP
    WHERE no = $1
    RETURNING *`;

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

const changeCheckinBayAndStaff = async (req, { checkin_id, bay_id, staff_ids = [] }) => {
  const client = await req.app.get('pool').connect();

  try {
    await client.query('BEGIN');

    const updateQuery = `
      UPDATE checkin
      SET bay_id = $2
      WHERE no = $1
      RETURNING *
    `;
    const updateResult = await client.query(updateQuery, [checkin_id, bay_id]);

    if (updateResult.rowCount === 0) {
      const err = new Error('Check-in record not found');
      err.status = 404;
      throw err;
    }

    await client.query(`DELETE FROM checkin_staff WHERE checkin_id = $1`, [checkin_id]);

    const normalizedStaffIds = Array.from(
      new Set((staff_ids || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))
    );

    let insertedStaff = [];
    if (normalizedStaffIds.length > 0) {
      const insertQuery = `
        INSERT INTO checkin_staff (checkin_id, staff_id, position)
        SELECT $1, s.no, s.type
        FROM staff s
        WHERE s.no = ANY($2::int[])
        RETURNING *
      `;
      const insertResult = await client.query(insertQuery, [checkin_id, normalizedStaffIds]);
      insertedStaff = insertResult.rows;

      if (insertedStaff.length !== normalizedStaffIds.length) {
        const err = new Error('Some selected staff were not found');
        err.status = 400;
        throw err;
      }
    }

    await client.query('COMMIT');

    return {
      checkin: updateResult.rows[0],
      staff: insertedStaff
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const cancelCheckinWithArchive = async (req, { checkin_id, action_by, remark }) => {
  const client = await req.app.get('pool').connect();

  try {
    await client.query('BEGIN');

    const archiveQuery = `
      INSERT INTO cencellcheckin (
        masterlist_id,
        action_by,
        checkin_id,
        bay_id,
        status,
        created_at,
        checkout_time,
        remark,
        type,
        checkin_time,
        accessory_status,
        accessory_pickup,
        showaccessories,
        preparing_time
      )
      SELECT
        masterlist_id,
        $2,
        no,
        bay_id,
        status,
        created_at,
        checkout_time,
        $3,
        type,
        checkin_time,
        accessory_status,
        accessory_pickup,
        showaccessories,
        preparing_time
      FROM checkin
      WHERE no = $1
      RETURNING *
    `;

    const archiveResult = await client.query(archiveQuery, [checkin_id, action_by, remark]);

    if (archiveResult.rowCount === 0) {
      const err = new Error('Check-in record not found');
      err.status = 404;
      throw err;
    }

    await client.query(`DELETE FROM checkin_staff WHERE checkin_id = $1`, [checkin_id]);

    const deleteResult = await client.query(`DELETE FROM checkin WHERE no = $1 RETURNING *`, [checkin_id]);

    if (deleteResult.rowCount === 0) {
      const err = new Error('Failed to delete check-in record');
      err.status = 500;
      throw err;
    }

    await client.query('COMMIT');

    return {
      archived: archiveResult.rows[0],
      deleted: deleteResult.rows[0]
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
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

const resetCheckinToStandby = async (req, checkin_id) => {
  const query = `
    UPDATE checkin
    SET status = 'Standby',
        checkin_time = NULL,
        checkout_time = NULL
    WHERE no = $1
    RETURNING *
  `;

  const values = [checkin_id];

  const result = await req.app.get('pool').query(query, values);
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
SELECT COUNT(DISTINCT m.no)::int AS count
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
WHERE c.checkin_time IS NULL
  AND m.cafi_date > DATE '2026-02-01' AND m.cancel_time is null

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
    WHERE LEFT(b.name, 1) != 'E' AND b.status = true
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
  if (Array.isArray(data.fitment_type) && data.fitment_type.length > 0) {
    addMaster(
      (p) => `SUBSTRING(fitment_id FROM 1 FOR 1) IN (${p.join(', ')})`,
      data.fitment_type
    );
  } else if (!Array.isArray(data.fitment_type) && data.fitment_type && data.fitment_type !== 'All') {
    addMaster((p) => `SUBSTRING(fitment_id FROM 1 FOR 1) = ${p[0]}`, [data.fitment_type]);
  }

  // Status (checkin table)
  if (data.status && data.status !== 'All') addJoin((p) => `c.status ILIKE ${p[0]}`, [`%${data.status}%`]);

  // Type (task_item)
  if (data.type && data.type !== 'All') addJoin((p) => `m2.type = ${p[0]}`, [data.type]);

  // Bay name (joined bay table)
  if (data.bay) addJoin((p) => `COALESCE(b.name, '') ILIKE ${p[0]}`, [`%${data.bay}%`]);
  if (data.staff_id) {
    addJoin(
      (p) => `EXISTS (SELECT 1 FROM checkin_staff csf WHERE csf.checkin_id = c.no AND csf.staff_id = ${p[0]})`,
      [Number(data.staff_id)]
    );
  }

  // Date range
  const today = new Date().toISOString().slice(0, 10);
  const dateFrom = data.date_from || today;
  const dateTo = data.date_to || dateFrom;
  const dateField = data.date_field === 'checkin' ? 'c.checkin_time' : 'm.cafi_date';
  if (data.backlog_only) {
    masterFilters.push(`status = 'Active'`);
    masterFilters.push(`cafi_date > DATE '2026-02-01'`);
    masterFilters.push(`cafi_date < CURRENT_DATE`);
    masterFilters.push(`no NOT IN (1306193, 2594130)`);
    joinFilters.push(`c.checkin_time IS NULL`);
  } else if (dateField === 'c.checkin_time') {
    addJoin((p) => `${dateField}::date BETWEEN ${p[0]}::date AND ${p[1]}::date`, [dateFrom, dateTo]);
  } else {
    addMaster((p) => `cafi_date::date BETWEEN ${p[0]}::date AND ${p[1]}::date`, [dateFrom, dateTo]);
  }

  const cteFilters = masterFilters;

  let query = `
   WITH filtered_master AS (
  SELECT *
  FROM masterlist
  WHERE ${cteFilters.join(' AND ')}
)
SELECT 
  m.no,
  m.model_code,
  m.chassis,
  m.model_description,
  m.seq,
  m.fitment_id,
  m.accessories_otp,
  SUBSTRING(m.fitment_id FROM 1 FOR 1) as fitment_type,
  m.colour,
  to_char(DATE(m.cafi_date), 'YYYY-MM-DD') AS cafi_date,
  to_char(DATE(m.caout_date), 'YYYY-MM-DD') AS caout_date,
  m.accessories_std,
    (
    SELECT json_agg(json_build_object('nick_name', s.nick_name) ORDER BY cs.staff_id ASC)
    FROM checkin_staff cs
    LEFT JOIN staff s ON s.no = cs.staff_id
    WHERE cs.checkin_id = c.no
  ) AS staff_list,

  -- accessories (by m2.type)
  (
    SELECT json_agg(json_build_object('short_name', ti.short_name))
    FROM task_item ti
    WHERE ti.masterlist_id = m.no
      AND ti.type = m2.type
  ) AS accessories,

  -- accessories2 (HOIST only)
  (
    SELECT json_agg(json_build_object('short_name', ti2.short_name))
    FROM task_item ti2
    WHERE ti2.masterlist_id = m.no
      AND ti2.type = 'HOIST'
  ) AS accessories2,

  m2.type,
  c.status,
  b.name AS bay_name,
  SUM(t.price) AS total,
  SUM(t.duration) AS duration,
  c.checkout_time,
  c.checkin_time,
  c.remark,

  CASE 
    WHEN c.checkin_time IS NOT NULL 
     AND c.checkout_time IS NOT NULL 
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
      m.accessories_otp,
      m2.type,
      c.status,
      b.name,
      c.created_at,
      c.checkout_time,
      c.checkin_time, 
      c.remark,
      c.no      
  `;

  if (joinFilters.length > 0) {
    query += ` HAVING ${joinFilters.join(' AND ')}`;
  }

  // 🔹 Ordering + pagination
  const limit = 10000 ;
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

const getCancelledCheckinList = async (req, data) => {
  const filters = [`m.cancel_time IS NULL`];
  const values = [];
  let paramIndex = 1;

  const addFilter = (condition, vals = []) => {
    const placeholders = vals.map(() => `$${paramIndex++}`);
    filters.push(condition(placeholders));
    values.push(...vals);
  };

  if (data.chassis) addFilter((p) => `m.chassis ILIKE ${p[0]}`, [`%${data.chassis}%`]);
  if (data.fitment_id) addFilter((p) => `m.fitment_id ILIKE ${p[0]}`, [`%${data.fitment_id}%`]);
  if (data.model) addFilter((p) => `m.model_description ILIKE ${p[0]}`, [`%${data.model}%`]);
  if (data.seq) addFilter((p) => `m.seq = ${p[0]}`, [Number(data.seq)]);
  if (data.bay) addFilter((p) => `COALESCE(b.name, '') ILIKE ${p[0]}`, [`%${data.bay}%`]);
  if (data.staff_id) {
    addFilter(
      (p) => `EXISTS (SELECT 1 FROM checkin_staff csf WHERE csf.checkin_id = cc.checkin_id AND csf.staff_id = ${p[0]})`,
      [Number(data.staff_id)]
    );
  }

  if (Array.isArray(data.fitment_type) && data.fitment_type.length > 0) {
    addFilter(
      (p) => `SUBSTRING(m.fitment_id FROM 1 FOR 1) IN (${p.join(', ')})`,
      data.fitment_type
    );
  } else if (!Array.isArray(data.fitment_type) && data.fitment_type && data.fitment_type !== 'All') {
    addFilter((p) => `SUBSTRING(m.fitment_id FROM 1 FOR 1) = ${p[0]}`, [data.fitment_type]);
  }

  const today = new Date().toISOString().slice(0, 10);
  const dateFrom = data.date_from || today;
  const dateTo = data.date_to || dateFrom;
  const dateField = data.date_field === 'checkin' ? 'cc.checkin_time' : 'm.cafi_date';
  addFilter((p) => `${dateField}::date BETWEEN ${p[0]}::date AND ${p[1]}::date`, [dateFrom, dateTo]);

  const query = `
    SELECT
      cc.no,
      cc.checkin_id,
      cc.status,
      cc.checkin_time,
      cc.checkout_time,
      cc.created_at AS cancelled_at,
      cc.remark,
      cc.type,
      m.no AS masterlist_no,
      m.model_code,
      m.chassis,
      m.model_description,
      m.seq,
      m.fitment_id,
      m.accessories_otp,
      SUBSTRING(m.fitment_id FROM 1 FOR 1) AS fitment_type,
      m.colour,
      to_char(DATE(m.cafi_date), 'YYYY-MM-DD') AS cafi_date,
      to_char(DATE(m.caout_date), 'YYYY-MM-DD') AS caout_date,
      m.accessories_std,
      b.name AS bay_name,
      COALESCE(SUM(t.price), 0) AS total,
      COALESCE(SUM(t.duration), 0) AS duration,
      (
        SELECT json_agg(json_build_object('short_name', ti.short_name))
        FROM task_item ti
        WHERE ti.masterlist_id = m.no
          AND ti.type = cc.type
      ) AS accessories
    FROM cencellcheckin cc
    LEFT JOIN masterlist m ON m.no = cc.masterlist_id
    LEFT JOIN bay b ON b.no = cc.bay_id
    LEFT JOIN task_item t ON t.masterlist_id = m.no AND t.type = cc.type
    WHERE ${filters.join(' AND ')}
    GROUP BY
      cc.no,
      cc.checkin_id,
      cc.status,
      cc.checkin_time,
      cc.checkout_time,
      cc.created_at,
      cc.remark,
      cc.type,
      m.no,
      m.model_code,
      m.chassis,
      m.model_description,
      m.seq,
      m.fitment_id,
      m.accessories_otp,
      m.colour,
      m.cafi_date,
      m.caout_date,
      m.accessories_std,
      b.name
    ORDER BY cc.created_at DESC, cc.no DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  values.push(Number(data.limit) || 10000, Number(data.offset) || 0);

  const result = await req.app.get('pool').query(query, values);
  return result.rows;
};

const getTasksStatusNullCount = async (req) => {
  console.log('run here')
  const query = `
    SELECT
      m.*,
      m2.type AS type,
      m2.masterlist_id AS task_item_masterlist_id,
      c.no AS checkin_id,
      c.masterlist_id AS checkin_masterlist_id,
      c.action_by,
      c.bay_id,
      c.status AS checkin_status,
      c.created_at AS checkin_created_at,
      c.checkout_time,
      c.remark,
      c.type AS checkin_type,
      c.checkin_time,
      c.accessories,
      c.accessory_status,
      c.accessory_pickup,
      c.showaccessories,
      c.preparing_time,
      c.checking,
      b.no AS bay_no,
      b.name AS bay_name,
      b.status AS bay_status,
      b.type AS bay_type
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

    WHERE c.checkin_time IS NULL 
      AND m.status = 'Active'
      AND m.cafi_date > DATE '2026-02-01'
      AND m.cafi_date < CURRENT_DATE
      AND m.cancel_time IS NULL
      AND m.no not IN (1306193, 2594130)
      AND m2.type IS NOT NULL

  `;

  const result = await req.app.get('pool').query(query);
  // console.log(result.rows)
  return result.rows
};

const getAchievementList = async (req, data) => {
  const filters = [];
  const values = [];
  const havingFilters = [];
  let i = 1;
  const finalCompletionExpr = `
    CASE
      WHEN MAX(CASE WHEN t.type = 'FITMENT' THEN 1 ELSE 0 END) = 1
        AND MAX(CASE WHEN c.type = 'FITMENT' THEN c.checkout_time END) IS NULL
      THEN NULL
      WHEN MAX(CASE WHEN t.type = 'HOIST' THEN 1 ELSE 0 END) = 1
        AND MAX(CASE WHEN c.type = 'HOIST' THEN c.checkout_time END) IS NULL
      THEN NULL
      WHEN MAX(CASE WHEN t.type = 'FITMENT' THEN 1 ELSE 0 END) = 1
        AND MAX(CASE WHEN t.type = 'HOIST' THEN 1 ELSE 0 END) = 1
      THEN GREATEST(
        MAX(CASE WHEN c.type = 'FITMENT' THEN c.checkout_time END),
        MAX(CASE WHEN c.type = 'HOIST' THEN c.checkout_time END)
      )
      WHEN MAX(CASE WHEN t.type = 'FITMENT' THEN 1 ELSE 0 END) = 1
      THEN MAX(CASE WHEN c.type = 'FITMENT' THEN c.checkout_time END)
      WHEN MAX(CASE WHEN t.type = 'HOIST' THEN 1 ELSE 0 END) = 1
      THEN MAX(CASE WHEN c.type = 'HOIST' THEN c.checkout_time END)
      ELSE NULL
    END
  `;

  filters.push(`m.cancel_time IS NULL`);

  if (data.chassis) {
    filters.push(`m.chassis ILIKE $${i++}`);
    values.push(`%${data.chassis}%`);
  }

  if (data.fitment_id) {
    filters.push(`m.fitment_id ILIKE $${i++}`);
    values.push(`%${data.fitment_id}%`);
  }

  if (data.seq) {
    filters.push(`m.seq = $${i++}`);
    values.push(Number(data.seq));
  }

  if (data.model) {
    filters.push(`m.model_description ILIKE $${i++}`);
    values.push(`%${data.model}%`);
  }

  if (data.model_code) {
    filters.push(`m.model_code ILIKE $${i++}`);
    values.push(`%${data.model_code}%`);
  }

  if (Array.isArray(data.fitment_type) && data.fitment_type.length > 0) {
    const placeholders = data.fitment_type.map((_, idx) => `$${i + idx}`);
    filters.push(`SUBSTRING(m.fitment_id FROM 1 FOR 1) IN (${placeholders.join(', ')})`);
    values.push(...data.fitment_type);
    i += data.fitment_type.length;
  } else if (!Array.isArray(data.fitment_type) && data.fitment_type && data.fitment_type !== 'All') {
    filters.push(`SUBSTRING(m.fitment_id FROM 1 FOR 1) = $${i++}`);
    values.push(data.fitment_type);
  }

  const today = new Date().toISOString().slice(0, 10);
  const dateFrom = data.date_from || today;
  const dateTo = data.date_to || dateFrom;
  const dateField = data.date_field === 'checkin'
    ? 'checkin'
    : data.date_field === 'checkout'
      ? 'checkout'
      : 'cafi';
  if (dateField === 'checkin') {
    filters.push(`
      EXISTS (
        SELECT 1
        FROM checkin c2
        WHERE c2.masterlist_id = m.no
          AND c2.type IN ('FITMENT', 'HOIST')
          AND c2.checkin_time::date BETWEEN $${i}::date AND $${i + 1}::date
      )
    `);
  } else if (dateField === 'checkout') {
    havingFilters.push(`(${finalCompletionExpr})::date BETWEEN $${i}::date AND $${i + 1}::date`);
  } else {
    filters.push(`m.cafi_date::date BETWEEN $${i}::date AND $${i + 1}::date`);
  }
  values.push(dateFrom, dateTo);
  i += 2;

  if (data.bay) {
    havingFilters.push(`(
      MAX(CASE WHEN b.type = 'FITMENT' THEN b.name END) ILIKE $${i}
      OR MAX(CASE WHEN b.type = 'HOIST' THEN b.name END) ILIKE $${i}
    )`);
    values.push(`%${data.bay}%`);
    i += 1;
  }

  let query = `
    SELECT 
      m.no,
      m.chassis,
      m.seq,
      m.fitment_id,
      SUBSTRING(m.fitment_id FROM 1 FOR 1) AS fitment_type,
      m.model_code,
      m.model_description,
      m.colour,
      m.accessories_std,
      to_char(DATE(m.cafi_date), 'YYYY-MM-DD') AS cafi_date,
      MAX(CASE WHEN t.type = 'FITMENT' THEN 1 ELSE 0 END) AS has_fitment,
      MAX(CASE WHEN t.type = 'HOIST' THEN 1 ELSE 0 END) AS has_hoist,
      MAX(CASE WHEN c.type = 'FITMENT' THEN c.checkin_time END) AS checkin_time_fitment,
      MAX(CASE WHEN c.type = 'HOIST' THEN c.checkin_time END) AS checkin_time_hoist,
      MAX(CASE WHEN c.type = 'FITMENT' THEN c.checkout_time END) AS checkout_time_fitment,
      MAX(CASE WHEN c.type = 'HOIST' THEN c.checkout_time END) AS checkout_time_hoist,
      ${finalCompletionExpr} AS checkout_time,
      MAX(CASE WHEN b.type = 'FITMENT' THEN b.name END) AS bay_fitment,
      MAX(CASE WHEN b.type = 'HOIST' THEN b.name END) AS bay_hoist
    FROM masterlist m
    LEFT JOIN task_item t 
      ON t.masterlist_id = m.no AND t.type IN ('FITMENT', 'HOIST')
    LEFT JOIN checkin c 
      ON c.masterlist_id = m.no AND c.type IN ('FITMENT', 'HOIST')
    LEFT JOIN bay b 
      ON b.no = c.bay_id
  `;

  if (filters.length > 0) {
    query += ` WHERE ${filters.join(' AND ')}`;
  }

  query += `
    GROUP BY 
      m.no,
      m.chassis,
      m.seq,
      m.fitment_id,
      m.model_code,
      m.model_description,
      m.colour,
      m.accessories_std,
      m.cafi_date
  `;

  if (havingFilters.length > 0) {
    query += ` HAVING ${havingFilters.join(' AND ')}`;
  }

  const limit = Number(data.limit) || 10000;
  const offset = Number(data.offset) || 0;
  query += `
    ORDER BY m.cafi_date DESC, m.no ASC
    LIMIT $${i} OFFSET $${i + 1}
  `;
  values.push(limit, offset);

  const result = await req.app.get('pool').query(query, values);
  return result.rows;
};

const getAchievementAnalysis = async (req, data) => {
  const filters = [];
  const values = [];
  const havingFilters = [];
  let i = 1;
  const finalCompletionExpr = `
    CASE
      WHEN MAX(CASE WHEN t.type = 'FITMENT' THEN 1 ELSE 0 END) = 1
        AND MAX(CASE WHEN c.type = 'FITMENT' THEN c.checkout_time END) IS NULL
      THEN NULL
      WHEN MAX(CASE WHEN t.type = 'HOIST' THEN 1 ELSE 0 END) = 1
        AND MAX(CASE WHEN c.type = 'HOIST' THEN c.checkout_time END) IS NULL
      THEN NULL
      WHEN MAX(CASE WHEN t.type = 'FITMENT' THEN 1 ELSE 0 END) = 1
        AND MAX(CASE WHEN t.type = 'HOIST' THEN 1 ELSE 0 END) = 1
      THEN GREATEST(
        MAX(CASE WHEN c.type = 'FITMENT' THEN c.checkout_time END),
        MAX(CASE WHEN c.type = 'HOIST' THEN c.checkout_time END)
      )
      WHEN MAX(CASE WHEN t.type = 'FITMENT' THEN 1 ELSE 0 END) = 1
      THEN MAX(CASE WHEN c.type = 'FITMENT' THEN c.checkout_time END)
      WHEN MAX(CASE WHEN t.type = 'HOIST' THEN 1 ELSE 0 END) = 1
      THEN MAX(CASE WHEN c.type = 'HOIST' THEN c.checkout_time END)
      ELSE NULL
    END
  `;

  if (data.chassis) {
    filters.push(`m.chassis ILIKE $${i++}`);
    values.push(`%${data.chassis}%`);
  }

  if (data.fitment_id) {
    filters.push(`m.fitment_id ILIKE $${i++}`);
    values.push(`%${data.fitment_id}%`);
  }

  if (data.seq) {
    filters.push(`m.seq = $${i++}`);
    values.push(Number(data.seq));
  }

  if (data.model) {
    filters.push(`m.model_description ILIKE $${i++}`);
    values.push(`%${data.model}%`);
  }

  if (data.model_code) {
    filters.push(`m.model_code ILIKE $${i++}`);
    values.push(`%${data.model_code}%`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const dateFrom = data.date_from || today;
  const dateTo = data.date_to || dateFrom;
  const dateField = data.date_field === 'checkin'
    ? 'checkin'
    : data.date_field === 'checkout'
      ? 'checkout'
      : 'cafi';
  if (dateField === 'checkin') {
    filters.push(`
      EXISTS (
        SELECT 1
        FROM checkin c2
        WHERE c2.masterlist_id = m.no
          AND c2.type IN ('FITMENT', 'HOIST')
          AND c2.checkin_time::date BETWEEN $${i}::date AND $${i + 1}::date
      )
    `);
  } else if (dateField === 'checkout') {
    havingFilters.push(`(${finalCompletionExpr})::date BETWEEN $${i}::date AND $${i + 1}::date`);
  } else {
    filters.push(`m.cafi_date::date BETWEEN $${i}::date AND $${i + 1}::date`);
  }
  values.push(dateFrom, dateTo);
  i += 2;

  if (data.bay) {
    havingFilters.push(`(
      MAX(CASE WHEN b.type = 'FITMENT' THEN b.name END) ILIKE $${i}
      OR MAX(CASE WHEN b.type = 'HOIST' THEN b.name END) ILIKE $${i}
    )`);
    values.push(`%${data.bay}%`);
    i += 1;
  }

  let query = `
    WITH base AS (
      SELECT
        m.no,
        MAX(CASE WHEN t.type = 'FITMENT' THEN 1 ELSE 0 END) AS has_fitment,
        MAX(CASE WHEN t.type = 'HOIST' THEN 1 ELSE 0 END) AS has_hoist,
        MAX(CASE WHEN c.type = 'FITMENT' THEN c.checkin_time END) AS checkin_time_fitment,
        MAX(CASE WHEN c.type = 'HOIST' THEN c.checkin_time END) AS checkin_time_hoist,
        MAX(CASE WHEN c.type = 'FITMENT' THEN c.checkout_time END) AS checkout_time_fitment,
        MAX(CASE WHEN c.type = 'HOIST' THEN c.checkout_time END) AS checkout_time_hoist,
        MAX(CASE WHEN b.type = 'FITMENT' THEN b.name END) AS bay_fitment,
        MAX(CASE WHEN b.type = 'HOIST' THEN b.name END) AS bay_hoist
      FROM masterlist m
      LEFT JOIN task_item t
        ON t.masterlist_id = m.no AND t.type IN ('FITMENT', 'HOIST')
      LEFT JOIN checkin c
        ON c.masterlist_id = m.no AND c.type IN ('FITMENT', 'HOIST')
      LEFT JOIN bay b
        ON b.no = c.bay_id
  `;

  if (filters.length > 0) {
    query += ` WHERE ${filters.join(' AND ')}`;
  }

  query += `
      GROUP BY m.no
  `;

  if (havingFilters.length > 0) {
    query += ` HAVING ${havingFilters.join(' AND ')}`;
  }

  query += `
    ),
    summary AS (
      SELECT
        (COALESCE(has_fitment, 0) + COALESCE(has_hoist, 0)) AS required_count,
        (CASE WHEN has_fitment = 1 AND checkout_time_fitment IS NOT NULL THEN 1 ELSE 0 END
         + CASE WHEN has_hoist = 1 AND checkout_time_hoist IS NOT NULL THEN 1 ELSE 0 END) AS completed_count,
        (CASE WHEN has_fitment = 1 AND checkin_time_fitment IS NOT NULL THEN 1 ELSE 0 END
         + CASE WHEN has_hoist = 1 AND checkin_time_hoist IS NOT NULL THEN 1 ELSE 0 END) AS checkin_count
      FROM base
    )
    SELECT
      SUM(CASE WHEN required_count > 0 AND completed_count = required_count THEN 1 ELSE 0 END)::int AS completed,
      SUM(CASE WHEN required_count > 0 AND checkin_count = 0 THEN 1 ELSE 0 END)::int AS pending,
      SUM(CASE WHEN required_count > 0 AND NOT (completed_count = required_count) AND NOT (checkin_count = 0) THEN 1 ELSE 0 END)::int AS ongoing
    FROM summary
  `;

  const result = await req.app.get('pool').query(query, values);
  return result.rows[0] || { completed: 0, pending: 0, ongoing: 0 };
};

const getHourlyCompletedStats = async (req) => {
  const baseCte = `
    WITH base AS (
      SELECT
        m.no,
        MAX(CASE WHEN t.type = 'FITMENT' THEN 1 ELSE 0 END) AS has_fitment,
        MAX(CASE WHEN t.type = 'HOIST' THEN 1 ELSE 0 END) AS has_hoist,
        MAX(CASE WHEN c.type = 'FITMENT' THEN c.checkin_time END) AS checkin_time_fitment,
        MAX(CASE WHEN c.type = 'HOIST' THEN c.checkin_time END) AS checkin_time_hoist,
        MAX(CASE WHEN c.type = 'FITMENT' THEN c.checkout_time END) AS checkout_time_fitment,
        MAX(CASE WHEN c.type = 'HOIST' THEN c.checkout_time END) AS checkout_time_hoist
      FROM masterlist m
      JOIN checkin c
        ON c.masterlist_id = m.no
        AND c.type IN ('FITMENT', 'HOIST')
      LEFT JOIN task_item t
        ON t.masterlist_id = m.no
        AND t.type IN ('FITMENT', 'HOIST')
      WHERE c.checkin_time::date = CURRENT_DATE
      GROUP BY m.no
    )
  `;

  const fitmentQuery = `
    ${baseCte}
    SELECT
      to_char(date_trunc('hour', checkout_time_fitment), 'HH24:00') AS hour,
      COUNT(*)::int AS count
    FROM base
    WHERE has_fitment = 1
      AND checkout_time_fitment IS NOT NULL
      AND checkout_time_fitment::date = CURRENT_DATE
    GROUP BY 1
    ORDER BY 1
  `;

  const hoistQuery = `
    ${baseCte}
    SELECT
      to_char(date_trunc('hour', checkout_time_hoist), 'HH24:00') AS hour,
      COUNT(*)::int AS count
    FROM base
    WHERE has_hoist = 1
      AND checkout_time_hoist IS NOT NULL
      AND checkout_time_hoist::date = CURRENT_DATE
    GROUP BY 1
    ORDER BY 1
  `;

  const totalQuery = `
    ${baseCte}
    SELECT
      to_char(date_trunc('hour',
        CASE
          WHEN has_fitment = 1 AND has_hoist = 1 THEN GREATEST(checkout_time_fitment, checkout_time_hoist)
          WHEN has_fitment = 1 THEN checkout_time_fitment
          WHEN has_hoist = 1 THEN checkout_time_hoist
          ELSE NULL
        END
      ), 'HH24:00') AS hour,
      COUNT(*)::int AS count
    FROM base
    WHERE (
        (has_fitment = 1 AND has_hoist = 1 AND checkout_time_fitment IS NOT NULL AND checkout_time_hoist IS NOT NULL)
        OR (has_fitment = 1 AND has_hoist = 0 AND checkout_time_fitment IS NOT NULL)
        OR (has_fitment = 0 AND has_hoist = 1 AND checkout_time_hoist IS NOT NULL)
      )
      AND (
        CASE
          WHEN has_fitment = 1 AND has_hoist = 1 THEN GREATEST(checkout_time_fitment, checkout_time_hoist)
          WHEN has_fitment = 1 THEN checkout_time_fitment
          WHEN has_hoist = 1 THEN checkout_time_hoist
          ELSE NULL
        END
      )::date = CURRENT_DATE
    GROUP BY 1
    ORDER BY 1
  `;

  const [fitment, hoist, total] = await Promise.all([
    req.app.get('pool').query(fitmentQuery),
    req.app.get('pool').query(hoistQuery),
    req.app.get('pool').query(totalQuery)
  ]);

  return {
    fitment: fitment.rows,
    hoist: hoist.rows,
    total: total.rows
  };
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
  SELECT
    ti.*,
    a.full_name,
    a.accessory_type,
    a.accessory_code,
    COALESCE(ti.type, a.type) AS task_type
  FROM task_item ti
  LEFT JOIN accessories a ON a.no = ti.accessories_id
  WHERE ti.masterlist_id = $1
    AND ti.type != 'New'
    AND ti.type != 'Excluded'
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

const updateTaskItemPriceWithHistory = async (req, { task_item_id, price, remark, action_by = null }) => {
  const client = await req.app.get('pool').connect();

  try {
    await client.query('BEGIN');

    const currentResult = await client.query(
      'SELECT * FROM task_item WHERE no = $1 FOR UPDATE',
      [task_item_id]
    );
    const current = currentResult.rows[0];
    if (!current) {
      const err = new Error('Task item not found');
      err.status = 404;
      throw err;
    }

    const nextPrice = Number(price);
    const updateResult = await client.query(
      'UPDATE task_item SET price = $1 WHERE no = $2 RETURNING *',
      [nextPrice, task_item_id]
    );

    const historyResult = await client.query(
      `
        INSERT INTO task_item_price_history (
          task_item_id, masterlist_id, old_price, new_price, remark, action_by
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `,
      [task_item_id, current.masterlist_id, current.price || 0, nextPrice, remark, action_by]
    );

    await client.query('COMMIT');

    return {
      task_item: updateResult.rows[0],
      history: historyResult.rows[0]
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const getTaskItemPriceHistory = async (req, taskItemIds = []) => {
  const ids = [...new Set((taskItemIds || []).map((id) => Number(id)).filter(Number.isFinite))];
  if (ids.length === 0) return [];

  const result = await req.app.get('pool').query(
    `
      SELECT h.*, COALESCE(a.username, s.nick_name) AS action_by_name
      FROM task_item_price_history h
      LEFT JOIN admins a ON a.id = h.action_by
      LEFT JOIN staff s ON s.no = h.action_by
      WHERE h.task_item_id = ANY($1::bigint[])
      ORDER BY h.created_at DESC, h.id DESC
    `,
    [ids]
  );

  return result.rows;
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
    c.accessory_pickup,
    c.accessories,
    c.preparing_time
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

const getStockCheckList = async (req , type ) => {

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
    c.accessory_pickup,
    c.accessories,
    c.preparing_time,
    c.checking
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
        c.type = 'FITMENT' AND    $1 = 'FITMENT'
    )
    OR (
        c.type = 'HOIST' AND    $1 = 'HOIST'
        AND s.model_code IS NOT NULL
    )) AND accessory_status != 'Completed'
    AND c.checking IS NULL
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

const updateCheckingTime = async (req, no) => {

  const query = `UPDATE checkin SET checking = $1 WHERE no = $2 RETURNING *`;

  const values = [
    new Date(), no
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  return result.rows[0];
};

const updatePreparing = async (req, no) => {

  const query = `UPDATE checkin SET preparing_time = $1 , accessory_status = 'Preparing' WHERE no = $2 RETURNING *`;

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
  WHERE c.status = 'Standby'
  ORDER BY
    CASE
      WHEN UPPER(TRIM(b.name)) ~ '^[A-E][0-9]+$' THEN 0
      ELSE 1
    END,
    LEFT(UPPER(TRIM(b.name)), 1) ASC,
    CASE
      WHEN UPPER(TRIM(b.name)) ~ '^[A-E][0-9]+$'
        THEN SUBSTRING(UPPER(TRIM(b.name)) FROM 2)::INTEGER
      ELSE NULL
    END ASC,
    UPPER(TRIM(COALESCE(b.name, ''))) ASC,
    c.created_at ASC,
    c.no ASC`;

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
      FROM bay b WHERE LEFT(b.name, 1) != 'E' AND b.status = true
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
WHERE LEFT(b.name, 1) != 'E' AND b.status = true
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
    ORDER BY c.created_at ASC
    LIMIT 1
) AS first_checkin ON TRUE

-- Count total check-ins per bay
LEFT JOIN LATERAL (
    SELECT COUNT(*) AS count_checkin
    FROM checkin c2
    WHERE c2.bay_id = b.no 
      AND c2.status = 'Check-In' AND c2.checkin_time is NULL
) AS total_checkin ON TRUE
WHERE LEFT(b.name, 1) != 'E' AND b.status = true
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
    m.accessories_otp , 
    m.accessories_std,
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
LEFT JOIN task_item t ON t.masterlist_id = m.no AND t.type = c.type


WHERE b.name = $1 AND c.status != 'Check-Out' AND c.status != 'Standby'

GROUP BY 
    c.checkin_time,
    m.fitment_id,
    m.model_code,
    m.chassis,
    m.model_description,
    c.remark,
    c.no,
    c.type,
    m.no ,
    m.accessories_otp , 
    m.accessories_std
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

const getStaffTaskList = async (req , month , staff_id, options = {}) => {
  const dateFrom = options.dateFrom || null;
  const dateTo = options.dateTo || null;
  const hasDateRange = Boolean(dateFrom && dateTo);
  const staffIdParam = hasDateRange ? '$1' : '$2';
  const dateFilterSql = hasDateRange
    ? `c.checkin_time >= $2::date
  AND c.checkin_time < ($3::date + INTERVAL '1 day')`
    : `c.checkin_time >= $1
  AND c.checkin_time < ($1::date + INTERVAL '1 month')`;

  const query = `SELECT 
    c.no AS checkin_id,
    c.checkin_time,
    m.cafi_date,
    m.fitment_id,
    m.chassis,
    m.colour,
    m.model_description,
    c.type,
    b.name AS bay_name,
    m.seq,

    t.total_duration,
    t.total_price,
    t.task,
    selected_staff.position AS staff_position,
    COALESCE(staff_counts.non_trainee_staff_count, 0) AS non_trainee_staff_count,
    CASE
        WHEN UPPER(COALESCE(selected_staff.position, '')) = 'TRAINEE' THEN 0
        WHEN COALESCE(staff_counts.non_trainee_staff_count, 0) = 0 THEN 0
        ELSE COALESCE(t.total_price, 0) / staff_counts.non_trainee_staff_count
    END AS staff_production_price,

    jsonb_agg(
        DISTINCT jsonb_build_object(
            'staff_id', s2.no,
            'nick_name', s2.nick_name,
            'position', s.position
        )
    ) FILTER (WHERE s2.no IS NOT NULL) AS staffList

FROM checkin c

LEFT JOIN masterlist m 
    ON m.no = c.masterlist_id

LEFT JOIN bay b
    ON b.no = c.bay_id

-- ✅ aggregate task first (prevents price multiplication)
LEFT JOIN LATERAL (
    SELECT
        SUM(duration) AS total_duration,
        SUM(price) AS total_price,
        jsonb_agg(
            DISTINCT jsonb_build_object(
                'short_name', short_name
            )
        ) FILTER (WHERE short_name IS NOT NULL) AS task
    FROM task_item
    WHERE masterlist_id = m.no
      AND type = c.type
) t ON TRUE

LEFT JOIN checkin_staff s 
    ON s.checkin_id = c.no

LEFT JOIN staff s2 
    ON s2.no = s.staff_id

LEFT JOIN checkin_staff selected_staff
    ON selected_staff.checkin_id = c.no
   AND selected_staff.staff_id = ${staffIdParam}

LEFT JOIN LATERAL (
    SELECT COUNT(*) AS non_trainee_staff_count
    FROM checkin_staff cs_count
    WHERE cs_count.checkin_id = c.no
      AND UPPER(COALESCE(cs_count.position, '')) != 'TRAINEE'
) staff_counts ON TRUE

WHERE ${dateFilterSql}
  AND m.cancel_time IS NULL

AND EXISTS (
    SELECT 1
    FROM checkin_staff cs
    WHERE cs.checkin_id = c.no
      AND cs.staff_id = ${staffIdParam}
)

GROUP BY
    c.no,
    c.checkin_time,
    m.cafi_date,
    m.fitment_id,
    m.chassis,
    m.colour,
    m.model_description,
    c.type,
    b.name,
    t.total_duration,
    t.total_price,
    t.task,
    selected_staff.position,
    staff_counts.non_trainee_staff_count,
    m.seq

ORDER BY c.checkin_time;
`;

  const values = hasDateRange
    ? [staff_id, dateFrom, dateTo]
    : [month, staff_id];

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
m.fitment_id , b.name , c.preparing_time , c.created_at
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
  getCancelledCheckinList,
  getTasksStatusNullCount,
  getTasksAnalisys2,
  getMasterList2,
  deleteCheckinStaff,
  getStandyList,
  getStockCheckList,
  updatePickup,
  getPickUpList,
  updatePickupTime,
  getCheckInList2,
  updateCheckInRemark,
  getStandbyList,
  updateCheckInNew,
  changeCheckinBayAndStaff,
  cancelCheckinWithArchive,
  getCheckINByNo,
  resetCheckinToStandby,
  getAchievementList,
  getAchievementAnalysis,
  getHourlyCompletedStats,
  getFitmentCurrentCheckin,
  updateReady,
  updateCheckingTime,
  getCollectScreen,
  getCurrentCheckin,
  getBayCurrentCheckin,
  searchMasterlistByno,
  findMasterlistByChassisFitment,
  findMasterlistsByFitmentIds,
  updateMasterlistFromImport,
  deleteTaskItemsByMasterlist,
  deleteTaskOffsetsByMasterlist,
  cancelCheckinsByMasterlist,
  cancelMasterlistForReplacement,
  updateMasterlistAccessoryFields,
  findTaskItemByMasterAccessory,
  deleteMasterlistWithTaskItems,
  updateMasterlistRemark,
  findMasterByChassisSeq,
  findStaffNosByStaffIds,
  insertManualCheckIn,
  createManualTaskCheckin,
  upsertManualTaskCheckin,
  getTaskbyNoandType,
  updateTaskItemPriceWithHistory,
  getTaskItemPriceHistory,
  getCheckinByNoandType,
  getCheckinByNo,
  getTaskbyNo,
  getStaffTaskList,
  getSpecialCarModelCodes,
  getSpecialCarModels,
  updateSpecialCarModelCodes,
  deleteCheckStaff,
  getPickCheckin,
  standbyHistory,
  getLastOpenCafiDate,
  cancelMasterlistByRange,
  inactiveMaster,
  getMasterBacklogCount,
  getTasksBacklogCount,
  getDashboardStats,
  insertCheckInStaffBatch,
  updatePreparing
};
