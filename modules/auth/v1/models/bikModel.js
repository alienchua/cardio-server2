const ensureBikTables = async (req) => {
  const pool = req.app.get('pool');
  const client = await pool.connect();
  try {
    await client.query(`SELECT pg_advisory_lock(hashtext('bik_task_tables'))`);
    await client.query(`CREATE TABLE IF NOT EXISTS settlement_month (id BIGSERIAL PRIMARY KEY, month VARCHAR(7) UNIQUE NOT NULL, is_settled BOOLEAN DEFAULT false, settled_at TIMESTAMP WITHOUT TIME ZONE)`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS bik_task (
        no BIGSERIAL PRIMARY KEY, seq VARCHAR(100) NOT NULL, chassis VARCHAR(255) NOT NULL,
        installation_date DATE NOT NULL, plan_date DATE NOT NULL, bay_id BIGINT NOT NULL REFERENCES bay(no),
        installer_staff_id BIGINT REFERENCES staff(no), price_cents BIGINT NOT NULL CONSTRAINT bik_task_price_cents_nonnegative CHECK (price_cents >= 0),
        accessory TEXT NOT NULL, model_description TEXT NOT NULL, colour TEXT NOT NULL, remarks TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(), updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMP WITHOUT TIME ZONE, created_by BIGINT, updated_by BIGINT, deleted_by BIGINT
      )
    `);
    await client.query(`ALTER TABLE bik_task ALTER COLUMN installer_staff_id DROP NOT NULL`);
    await client.query(`
      DO $$
      DECLARE price_constraint_name TEXT;
      BEGIN
        SELECT conname INTO price_constraint_name
        FROM pg_constraint
        WHERE conrelid = 'bik_task'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ~ 'price_cents.*> 0'
        LIMIT 1;

        IF price_constraint_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE bik_task DROP CONSTRAINT %I', price_constraint_name);
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'bik_task'::regclass
            AND conname = 'bik_task_price_cents_nonnegative'
        ) THEN
          ALTER TABLE bik_task
            ADD CONSTRAINT bik_task_price_cents_nonnegative CHECK (price_cents >= 0);
        END IF;
      END $$
    `);
    await client.query(`ALTER TABLE bik_task ADD COLUMN IF NOT EXISTS plan_date DATE`);
    await client.query(`UPDATE bik_task SET plan_date = installation_date WHERE plan_date IS NULL`);
    await client.query(`ALTER TABLE bik_task ALTER COLUMN plan_date SET NOT NULL`);
    await client.query(`ALTER TABLE bik_task ADD COLUMN IF NOT EXISTS remarks TEXT NOT NULL DEFAULT ''`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS bik_task_staff (
        bik_task_id BIGINT NOT NULL REFERENCES bik_task(no) ON DELETE CASCADE,
        staff_id BIGINT NOT NULL REFERENCES staff(no), created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        PRIMARY KEY (bik_task_id, staff_id)
      )
    `);
    await client.query(`
      INSERT INTO bik_task_staff (bik_task_id, staff_id)
      SELECT no, installer_staff_id FROM bik_task WHERE installer_staff_id IS NOT NULL
      ON CONFLICT (bik_task_id, staff_id) DO NOTHING
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_bik_task_installation_date ON bik_task (installation_date) WHERE deleted_at IS NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_bik_task_staff_member ON bik_task_staff (staff_id, bik_task_id)`);
  } finally {
    try { await client.query(`SELECT pg_advisory_unlock(hashtext('bik_task_tables'))`); } finally { client.release(); }
  }
};

const installerAggregationSql = `
  LEFT JOIN LATERAL (
    SELECT
      ARRAY_AGG(bs.staff_id ORDER BY COALESCE(s.nick_name, s.name), bs.staff_id) AS installer_staff_ids,
      JSONB_AGG(JSONB_BUILD_OBJECT('no', s.no, 'staff_id', s.staff_id, 'name', s.name, 'nick_name', s.nick_name) ORDER BY COALESCE(s.nick_name, s.name), bs.staff_id) AS installer_list,
      STRING_AGG(COALESCE(NULLIF(s.nick_name, ''), s.name, s.staff_id::text), ', ' ORDER BY COALESCE(s.nick_name, s.name), bs.staff_id) AS installer_names
    FROM bik_task_staff bs JOIN staff s ON s.no = bs.staff_id
    WHERE bs.bik_task_id = b.no
  ) installers ON true
`;

// Installation dates are business calendar dates, not points in time. Returning a PostgreSQL
// DATE directly lets node-postgres turn midnight in the server timezone into a UTC timestamp,
// which can appear as the prior day in Malaysia. Keep the API contract date-only instead.
const bikTaskSelectColumns = `
  b.no, b.seq, b.chassis, to_char(b.installation_date, 'YYYY-MM-DD') AS installation_date,
  to_char(b.plan_date, 'YYYY-MM-DD') AS plan_date,
  b.bay_id, b.installer_staff_id, b.price_cents, b.accessory, b.model_description, b.colour, b.remarks,
  b.created_at, b.updated_at, b.deleted_at, b.created_by, b.updated_by, b.deleted_by
`;

const getBikTaskById = async (req, no, { includeDeleted = false } = {}) => {
  await ensureBikTables(req);
  const result = await req.app.get('pool').query(`
    SELECT ${bikTaskSelectColumns}, bay.name AS bay_name, COALESCE(installer_staff_ids, ARRAY[]::bigint[]) AS installer_staff_ids,
      COALESCE(installer_list, '[]'::jsonb) AS installer_list, COALESCE(installer_names, '') AS installer_names
    FROM bik_task b JOIN bay ON bay.no = b.bay_id ${installerAggregationSql}
    WHERE b.no = $1 ${includeDeleted ? '' : 'AND b.deleted_at IS NULL'}`, [no]);
  return result.rows[0] || null;
};

const getBikTasks = async (req, { dateFrom, dateTo }) => {
  await ensureBikTables(req);
  const result = await req.app.get('pool').query(`
    SELECT ${bikTaskSelectColumns},
      bay.name AS bay_name, COALESCE(installer_staff_ids, ARRAY[]::bigint[]) AS installer_staff_ids,
      COALESCE(installer_list, '[]'::jsonb) AS installer_list, COALESCE(installer_names, '') AS installer_names
    FROM bik_task b JOIN bay ON bay.no = b.bay_id ${installerAggregationSql}
    WHERE b.deleted_at IS NULL AND b.installation_date BETWEEN $1::date AND $2::date
    ORDER BY b.installation_date DESC, b.no DESC`, [dateFrom, dateTo]);
  return result.rows;
};

const insertBikStaff = (client, bikTaskId, staffIds) => client.query(
  `INSERT INTO bik_task_staff (bik_task_id, staff_id) SELECT $1, UNNEST($2::bigint[]) ON CONFLICT (bik_task_id, staff_id) DO NOTHING`,
  [bikTaskId, staffIds]
);

const createBikTask = async (req, data, userId = null) => {
  await ensureBikTables(req);
  const client = await req.app.get('pool').connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      INSERT INTO bik_task (seq, chassis, installation_date, plan_date, bay_id, installer_staff_id, price_cents, accessory, model_description, colour, remarks, created_by, updated_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
      RETURNING no, seq, chassis, to_char(installation_date, 'YYYY-MM-DD') AS installation_date,
        to_char(plan_date, 'YYYY-MM-DD') AS plan_date, bay_id, installer_staff_id,
        price_cents, accessory, model_description, colour, remarks, created_at, updated_at, deleted_at, created_by, updated_by, deleted_by`,
    [data.seq, data.chassis, data.installation_date, data.plan_date, data.bay_id, data.installer_staff_ids[0] || null, data.price_cents, data.accessory, data.model_description, data.colour, data.remarks, userId]);
    await insertBikStaff(client, result.rows[0].no, data.installer_staff_ids);
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
};

const updateBikTask = async (req, no, data, userId = null) => {
  await ensureBikTables(req);
  const client = await req.app.get('pool').connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      UPDATE bik_task SET seq = $2, chassis = $3, installation_date = $4, plan_date = $5, bay_id = $6, installer_staff_id = $7,
        price_cents = $8, accessory = $9, model_description = $10, colour = $11, remarks = $12, updated_at = NOW(), updated_by = $13
      WHERE no = $1 AND deleted_at IS NULL
      RETURNING no, seq, chassis, to_char(installation_date, 'YYYY-MM-DD') AS installation_date,
        to_char(plan_date, 'YYYY-MM-DD') AS plan_date, bay_id, installer_staff_id,
        price_cents, accessory, model_description, colour, remarks, created_at, updated_at, deleted_at, created_by, updated_by, deleted_by`,
    [no, data.seq, data.chassis, data.installation_date, data.plan_date, data.bay_id, data.installer_staff_ids[0] || null, data.price_cents, data.accessory, data.model_description, data.colour, data.remarks, userId]);
    if (result.rowCount === 0) { await client.query('ROLLBACK'); return null; }
    await client.query(`DELETE FROM bik_task_staff WHERE bik_task_id = $1`, [no]);
    await insertBikStaff(client, no, data.installer_staff_ids);
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
};

const softDeleteBikTask = async (req, no, userId = null) => {
  await ensureBikTables(req);
  const result = await req.app.get('pool').query(
    `UPDATE bik_task SET deleted_at = NOW(), deleted_by = $2, updated_at = NOW(), updated_by = $2 WHERE no = $1 AND deleted_at IS NULL RETURNING *`, [no, userId]);
  return result.rows[0] || null;
};

const isBikMonthSettled = async (req, month) => {
  await ensureBikTables(req);
  const result = await req.app.get('pool').query(`SELECT 1 FROM settlement_month WHERE month = $1 AND is_settled = true LIMIT 1`, [month]);
  return result.rowCount > 0;
};

const getBikProductionByStaff = async (req, month, { dateFrom = null, dateTo = null } = {}) => {
  await ensureBikTables(req);
  const hasRange = Boolean(dateFrom && dateTo);
  const result = await req.app.get('pool').query(`
    WITH assigned_bik AS (
      SELECT b.no, b.price_cents, bs.staff_id, COUNT(*) OVER (PARTITION BY b.no) AS installer_count
      FROM bik_task b JOIN bik_task_staff bs ON bs.bik_task_id = b.no
      WHERE b.deleted_at IS NULL AND ${hasRange ? 'b.installation_date BETWEEN $1::date AND $2::date' : "b.installation_date >= to_date($1, 'YYYY-MM') AND b.installation_date < (to_date($1, 'YYYY-MM') + INTERVAL '1 month')"}
    )
    SELECT staff_id, SUM(price_cents::numeric / NULLIF(installer_count, 0)) AS total_com FROM assigned_bik GROUP BY staff_id`,
  hasRange ? [dateFrom, dateTo] : [month]);
  return result.rows;
};

const getBikTaskListForStaff = async (req, staffId, { month, dateFrom = null, dateTo = null } = {}) => {
  await ensureBikTables(req);
  const hasRange = Boolean(dateFrom && dateTo);
  const result = await req.app.get('pool').query(`
    SELECT ('bik-' || b.no)::text AS checkin_id, b.installation_date::timestamp AS checkin_time,
      to_char(b.plan_date, 'YYYY-MM-DD') AS cafi_date,
      'BIK'::text AS fitment_id, b.chassis, b.colour, b.model_description, 'BIK'::text AS type, bay.name AS bay_name, b.seq,
      0::numeric AS total_duration, b.price_cents::numeric AS total_price,
      jsonb_build_array(jsonb_build_object('short_name', b.accessory)) AS task, 'INSTALLER'::text AS staff_position,
      staff_counts.installer_count AS non_trainee_staff_count, b.price_cents::numeric / NULLIF(staff_counts.installer_count, 0) AS staff_production_price,
      staff_lists.staff_list AS "staffList", true AS is_bik
    FROM bik_task b
    JOIN bik_task_staff selected_staff ON selected_staff.bik_task_id = b.no AND selected_staff.staff_id = $1
    JOIN bay ON bay.no = b.bay_id
    JOIN LATERAL (SELECT COUNT(*)::int AS installer_count FROM bik_task_staff bs WHERE bs.bik_task_id = b.no) staff_counts ON true
    JOIN LATERAL (
      SELECT JSONB_AGG(JSONB_BUILD_OBJECT('staff_id', s.no, 'nick_name', s.nick_name, 'position', 'INSTALLER') ORDER BY COALESCE(s.nick_name, s.name), s.no) AS staff_list
      FROM bik_task_staff bs JOIN staff s ON s.no = bs.staff_id WHERE bs.bik_task_id = b.no
    ) staff_lists ON true
    WHERE b.deleted_at IS NULL AND ${hasRange ? 'b.installation_date BETWEEN $2::date AND $3::date' : "b.installation_date >= $2::date AND b.installation_date < ($2::date + INTERVAL '1 month')"}
    ORDER BY b.installation_date, b.no`, hasRange ? [staffId, dateFrom, dateTo] : [staffId, `${month}-01`]);
  return result.rows;
};

module.exports = { ensureBikTables, getBikTaskById, getBikTasks, createBikTask, updateBikTask, softDeleteBikTask, isBikMonthSettled, getBikProductionByStaff, getBikTaskListForStaff };
