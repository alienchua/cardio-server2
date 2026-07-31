require('dotenv').config();



const updateAccessoriesModel = async (req, updates) => {
  const client = req.db; // assuming `req.db` is your pg client

  const nos = updates.map(u => u.no);

  // Build SQL CASE statements
  const model_code_sql = updates.map(u => `WHEN ${u.no} THEN '${u.model_code}'`).join(" ");
  const model_description_sql = updates.map(u => `WHEN ${u.no} THEN '${u.model_description}'`).join(" ");
  const accessory_type_sql = updates.map(u => `WHEN ${u.no} THEN '${u.accessory_type}'`).join(" ");
  const accessory_code_sql = updates.map(u => `WHEN ${u.no} THEN '${u.accessory_code}'`).join(" ");
  const price_sql = updates.map(u => `WHEN ${u.no} THEN ${u.price}`).join(" ");
  const duration_sql = updates.map(u => `WHEN ${u.no} THEN ${u.duration}`).join(" ");
  const type_sql = updates.map(u => `WHEN ${u.no} THEN '${u.type}'`).join(" ");
  const full_name = updates.map(u => `WHEN ${u.no} THEN '${u.full_name}'`).join(" ");
  const short_name = updates.map(u => `WHEN ${u.no} THEN '${u.short_name}'`).join(" ");

  const sql = `
    UPDATE accessories
    SET 
      model_code = CASE no ${model_code_sql} END,
      model_description = CASE no ${model_description_sql} END,
      accessory_type = CASE no ${accessory_type_sql} END,
      accessory_code = CASE no ${accessory_code_sql} END,
      price = CASE no ${price_sql} END,
      duration = CASE no ${duration_sql} END,
      type = CASE no ${type_sql} END,
      full_name = CASE no ${full_name} END,
      short_name = CASE no ${short_name} END
    WHERE no IN (${nos.join(",")})
  `;

  return  req.app.get('pool').query(sql);
};

const insertAccessoriesModel = async (req, accessories) => {
  const columns = [
    "model_code",
    "model",
    "model_description",
    "accessory_type",
    "accessory_code",
    "price",
    "duration",
    "type",
    "full_name",
    "short_name"
  ];

  const values = [];
  const placeholders = accessories.map((item, i) => {
    const baseIndex = i * columns.length;
    values.push(
      item.model_code,
      item.model,
      item.model_description,
      item.accessory_type,
      item.accessory_code,
      item.price * 100,
      item.duration,
      item.type,
      item.full_name,
      item.short_name
    );
    return `(${columns.map((_, j) => `$${baseIndex + j + 1}`).join(",")})`;
  }).join(",");

  const sql = `
    INSERT INTO accessories (${columns.join(", ")})
    VALUES ${placeholders}
    RETURNING *
  `;

  const result = await req.app.get('pool').query(
    sql,
    values
  );
  return result.rows

};

// const insertAccessory = async (req, code, type, modal_code, description, group) => {

//   const result = await req.app.get('pool').query(`INSERT INTO accessories (
//         accessory_code, accessory_type, model_code, model_description, model_group, price, duration, short_name
//       ) VALUES ($1,$2,$3,$4,$5,NULL,NULL,NULL)c
//       RETURNING *`, [code, type, modal_code, description, group]);
//   return result.rows[0];

// };

const insertAccessory = async (req, acc, client = null) => {
  const db = client || req.app.get('pool');
  const query = `
    INSERT INTO accessories (accessory_code, accessory_type, model_code, model_description, model , price , duration , type)
    VALUES ($1,$2,$3,$4,$5 , $6 , $7 , 'New')
    RETURNING no
  `;
  const values = [
    acc.code, acc.type, acc.modal_code, acc.Model_Description, acc.Model_Group , 0 , 0
  ];
  const result = await db.query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows[0].no;
};


const findAccessory = async (req,  data, client = null) => {
  const db = client || req.app.get('pool');
  const result = await db.query(`SELECT * FROM accessories 
      WHERE  model=$1 AND model_description= $2 
	  AND accessory_type=$3 AND accessory_code=$4 AND model_code = $5`, 
    [ data.Model_Group , data.Model_Description, data.type , data.code, data.modal_code]);
  return result.rows[0];
};


const updateAccessoryByNO = async (req, price, duration, type, full_name, short_name, no, options = {}) => {
  const pool = req.app.get('pool');
  const { updateTaskItems = false, taskItemFromDate = null } = options;

  if (updateTaskItems && !taskItemFromDate) {
    throw new Error('task_item_from_date is required when updating task items');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const accessoryResult = await client.query(`UPDATE accessories SET price = $1 , duration = $2 , 
      type = $3 , full_name = $4 , short_name = $5
WHERE no = $6 RETURNING *`, [price, duration, type, full_name, short_name, no]);

    let taskItemsUpdatedCount = 0;
    if (updateTaskItems) {
      const taskItemResult = await client.query(`
        UPDATE task_item ti
        SET price = $1, duration = $2, type = $3, short_name = $4
        FROM masterlist m
        WHERE ti.accessories_id = $5
          AND ti.masterlist_id = m.no
          AND m.cafi_date::date >= $6::date
        RETURNING ti.*;
      `, [price, duration, type, short_name, no, taskItemFromDate]);

      taskItemsUpdatedCount = taskItemResult.rowCount;
    }

    await client.query('COMMIT');
    return {
      accessory: accessoryResult.rows[0],
      taskItemsUpdatedCount
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const getNewAccessory = async (req,  data) => {
  const result = await req.app.get('pool').query(`
    SELECT 	model_code, model, model_description, accessory_type, accessory_code, 
	    ROUND(price::DECIMAL / 100, 2) AS price
		, duration, type, no, full_name, short_name, accy_type, status, canzero
    FROM accessories
    WHERE type != 'EXCLUDED' AND (type = 'New'
       OR (price IS NULL AND COALESCE(canzero, false) = false)
       OR duration IS NULL
       OR full_name IS NULL
       OR short_name IS NULL
        OR (price = 0 AND COALESCE(canzero, false) = false)
        OR duration = 0)
  `, []);
  return result.rows;
};

const getNewAccessoryByNo = async (req,  no) => {

  const result = await req.app.get('pool').query(`SELECT * FROM accessories WHERE no = $1 `, [no]);
  return result.rows[0];
};

const getAccessoryGroup = async (req,  no) => {

  const result = await req.app.get('pool').query(`
SELECT
      model_code,
      model,
      model_description,
      COUNT(*) AS total_products,
      COALESCE(SUM(duration) FILTER (WHERE type = 'FITMENT'), 0) AS fitment_duration,
      COALESCE(SUM(duration) FILTER (WHERE type = 'HOIST'), 0) AS hoist_duration,
	  COALESCE(SUM(price) FILTER (WHERE type = 'FITMENT'), 0) AS fitment_price,
      COALESCE(SUM(price) FILTER (WHERE type = 'HOIST'), 0) AS hoist_price,
      COUNT(*) FILTER (WHERE type = 'FITMENT') AS fitment_count,
      COUNT(*) FILTER (WHERE type = 'HOIST') AS hoist_count
    FROM accessories
    GROUP BY model_code, model, model_description
  `);
  return result.rows;
};

const getAccessoriesList = async (req, options = {}) => {
  const limit = Math.min(Math.max(Number(options.limit) || 10, 1), 100);
  const offset = Math.max(Number(options.offset) || 0, 0);
  const search = String(options.search || '').trim();
  const values = [];
  let whereSql = '';

  if (search) {
    values.push(`%${search}%`);
    whereSql = `
      WHERE model_code ILIKE $1
        OR model ILIKE $1
        OR model_description ILIKE $1
        OR accessory_type ILIKE $1
        OR accessory_code ILIKE $1
        OR full_name ILIKE $1
        OR short_name ILIKE $1
        OR type ILIKE $1
    `;
  }

  const countResult = await req.app.get('pool').query(
    `SELECT COUNT(*)::int AS total FROM accessories ${whereSql}`,
    values
  );

  values.push(limit, offset);
  const limitParam = values.length - 1;
  const offsetParam = values.length;

  const result = await req.app.get('pool').query(`
    SELECT
      no,
      model_code,
      model,
      model_description,
      accessory_type,
      accessory_code,
      ROUND(COALESCE(price, 0)::DECIMAL / 100, 2) AS price,
      duration,
      type,
      full_name,
      short_name,
      accy_type,
      status,
      canzero
    FROM accessories
    ${whereSql}
    ORDER BY no DESC
    LIMIT $${limitParam} OFFSET $${offsetParam}
  `, values);

  return {
    rows: result.rows,
    total: Number(countResult.rows[0]?.total || 0),
    limit,
    offset
  };
};

const getAccessoriesByModel = async (req, model_code, model_description) => {
  console.log( model_code, model_description)
  const query = `
    SELECT *
    FROM accessories
    WHERE ($1::text IS NULL OR model_code = $1)
      AND ($2::text IS NULL OR model = $2)
    ORDER BY accessory_type, accessory_code
  `;
  const values = [
    model_code || null,
    model_description || null
  ];
  const result = await req.app.get('pool').query(query, values);
  return result.rows;
};

const updateAccessories2Model = async (req, updates) => {
  const pool = req.app.get('pool');
  if (!pool) {
    throw new Error('Database connection not available');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const results = [];

    for (const u of updates) {
      const { price, duration, type, full_name, short_name, canzero = false, no } = u;

      const accessoryQuery = `
        UPDATE accessories 
        SET price = $1, duration = $2, type = $3, full_name = $4, short_name = $5, canzero = $6
        WHERE no = $7 
        RETURNING *;
      `;
      const accessoryValues = [price, duration, type, full_name, short_name, canzero, no];
      const accessoryResult = await client.query(accessoryQuery, accessoryValues);

      const taskItemQuery = `
        UPDATE task_item
        SET price = $1, duration = $2, type = $3, short_name = $4
        WHERE accessories_id = $5
        RETURNING *;
      `;
      await client.query(taskItemQuery, [price, duration, type, short_name, no]);

      results.push(accessoryResult.rows[0]);
    }

    await client.query('COMMIT');
    return results;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};


module.exports = {
  updateAccessoriesModel,
  insertAccessoriesModel,
  insertAccessory,
  findAccessory,
  updateAccessoryByNO,
  getNewAccessory,
  getNewAccessoryByNo,
  getAccessoryGroup,
  getAccessoriesList,
  getAccessoriesByModel,
  updateAccessories2Model
};
