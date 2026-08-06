require('dotenv').config();

const { normalizeAbsenceExceptionInput, errorWithStatus } = require('../utils/salaryAbsenceException');

const SALARY_EXCLUDED_STAFF_IDS = ['01111', '01112', '01113'];
const DEFAULT_BASE_PAY_RULES = [
  { min_days: 0, amount: 0 },
  { min_days: 9, amount: 500 },
  { min_days: 14, amount: 1000 },
  { min_days: 16, amount: 1500 }
];

const ADJUSTMENT_TYPES = ['Port', 'Deduct', 'Cash Adv', 'Released', 'Adj 1', 'Defect', 'Part&Tools'];

const insertInstallment = async (req , staff_id , amount , installment , remark ) => {

  const query = `INSERT INTO installment(staff_id , amount , installment , remark) VALUES ($1, $2, $3, $4) RETURNING *`;

  const values = [
   staff_id , amount , installment , remark
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows;
};

const getInstallment = async (req  ) => {

  const query = `SELECT i.* , s.name ,
      GREATEST(
        installment - (
            EXTRACT(YEAR FROM age(NOW(), created_at)) * 12 +
            EXTRACT(MONTH FROM age(NOW(), created_at))
        ),
        0
    ) AS months_left FROM installment i LEFT JOIN  staff s ON i.staff_id = s.no`;

  const values = [
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows;
};

const getInstallmentByNo = async (req , no ) => {
  const query = `SELECT i.* , s.name ,
      GREATEST(
        installment - (
            EXTRACT(YEAR FROM age(NOW(), created_at)) * 12 +
            EXTRACT(MONTH FROM age(NOW(), created_at))
        ),
        0
    ) AS months_left FROM installment i LEFT JOIN  staff s ON i.staff_id = s.no WHERE i.no = $1`;

  const values = [
    no
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  return result.rows[0];
};

const getSalarySnapshotRows = async (req, month) => {
  await ensureSalaryFinanceTables(req);

  const result = await req.app.get('pool').query(
    `
      SELECT
        staff_no AS no,
        staff_id,
        name,
        nick_name,
        ic,
        email,
        bank_name,
        acc_number,
        staff_type AS type,
        photo,
        total_com,
        total_deduct,
        total_installment,
        attendance,
        absent,
        late,
        mc,
        hl,
        q,
        al,
        el,
        ul,
        cl,
        base_pay,
        production,
        system_deduction,
        final_balance_payment,
        total_pay_out,
        deductible_absent,
        normal_absenteeism_deduction,
        attendance_absenteeism,
        absence_exception,
        finance,
        true AS is_settlement_snapshot
      FROM salary_settlement_snapshot
      WHERE month = $1
        AND COALESCE(staff_id, '') <> ALL($2::text[])
      ORDER BY staff_no
    `,
    [month, SALARY_EXCLUDED_STAFF_IDS]
  );

  return result.rows;
};

const getSalaryResult = async (req , month, options = {} ) => {
  const dateFrom = options.dateFrom || null;
  const dateTo = options.dateTo || null;
  const hasDateRange = Boolean(dateFrom && dateTo);

  if (!hasDateRange && options.useSnapshot !== false) {
    const snapshotRows = await getSalarySnapshotRows(req, month);
    if (snapshotRows.length > 0) return snapshotRows;
  }

  const checkinDateSql = hasDateRange
    ? `c.checkin_time >= $3::date AND c.checkin_time < ($4::date + INTERVAL '1 day')`
    : `c.checkin_time >= to_date($1, 'YYYY-MM')
    AND c.checkin_time < (to_date($1, 'YYYY-MM') + INTERVAL '1 month')`;
  const offsetDateSql = hasDateRange
    ? `o.created_at >= $3::date AND o.created_at < ($4::date + INTERVAL '1 day')`
    : `TO_CHAR(o.created_at, 'YYYY-MM') =  $1`;

  const query = `WITH selectdata AS (
  SELECT 
    c.no AS checkin_no,
    c.masterlist_id,
    c.type,
    c.status,
    COALESCE(cs.total_staff, 0) AS total_staff,
    COALESCE(ti.total_price, 0) AS total_price,
    CASE 
      WHEN COALESCE(cs.total_staff, 0) = 0 THEN 0
      ELSE (COALESCE(ti.total_price, 0) / COALESCE(cs.total_staff, 0))::DECIMAL
    END AS total_com
  FROM checkin c
  LEFT JOIN (
    SELECT checkin_id, COUNT(*) AS total_staff
    FROM checkin_staff 
    WHERE UPPER(COALESCE(position, '')) != 'TRAINEE'
    GROUP BY checkin_id
  ) cs ON cs.checkin_id = c.no
  LEFT JOIN (
    SELECT masterlist_id, type, SUM(price) AS total_price
    FROM task_item
    GROUP BY masterlist_id, type
  ) ti ON ti.masterlist_id = c.masterlist_id AND ti.type = c.type
  JOIN masterlist m ON m.no = c.masterlist_id AND m.cancel_time IS NULL
  WHERE ${checkinDateSql}
),
builddata AS (
  SELECT 
    cs.staff_id, 
    SUM(sd.total_com) AS total_com
  FROM checkin_staff cs
  LEFT JOIN selectdata sd ON sd.checkin_no = cs.checkin_id
  WHERE UPPER(COALESCE(cs.position, '')) != 'TRAINEE'
  GROUP BY cs.staff_id
),
builddata2 AS (
  SELECT o.staff_id, SUM(o.amount2 + o.amount) as total 
  FROM task_offset o
  JOIN masterlist m ON m.no = o.masterlist_id AND m.cancel_time IS NULL
  WHERE ${offsetDateSql}
  GROUP BY o.staff_id
),
inst AS (
  SELECT 
    staff_id,
    SUM(
      CASE 
        WHEN (installment - (
          EXTRACT(YEAR FROM age(to_date( $1, 'YYYY-MM'), created_at)) * 12 +
          EXTRACT(MONTH FROM age(to_date( $1, 'YYYY-MM'), created_at))
        )) > 0 THEN amount
        ELSE 0
      END
    ) AS total_installment
  FROM installment
  GROUP BY staff_id
),
attendance AS (
  SELECT
    staff_id,
    MAX(attendance) AS attendance,
    MAX(absent) AS absent,
    MAX(late) AS late,
    MAX(mc) AS mc,
    MAX(hl) AS hl,
    MAX(q) AS q,
    MAX(al) AS al,
    MAX(el) AS el,
    MAX(ul) AS ul,
    MAX(cl) AS cl
  FROM staff_attendance
  WHERE month_label = $1
  GROUP BY staff_id
)
SELECT 
  s.no,
  s.staff_id,
  s.name,
  s.nick_name,
  s.ic,
  s.email,
  s.bank_name,
  s.acc_number,
  s.type,
  s.photo,
  COALESCE(b.total_com, 0) AS total_com,
  COALESCE(b2.total, 0) + COALESCE(inst.total_installment, 0) AS total_deduct,
  COALESCE(inst.total_installment, 0) as total_installment,
  COALESCE(sa.attendance, 0) AS attendance,
  COALESCE(sa.absent, 0) AS absent,
  COALESCE(sa.late, 0) AS late,
  COALESCE(sa.mc, 0) AS mc,
  COALESCE(sa.hl, 0) AS hl,
  COALESCE(sa.q, 0) AS q,
  COALESCE(sa.al, 0) AS al,
  COALESCE(sa.el, 0) AS el,
  COALESCE(sa.ul, 0) AS ul,
  COALESCE(sa.cl, 0) AS cl
FROM staff s
LEFT JOIN builddata b ON s.no = b.staff_id
LEFT JOIN builddata2 b2 ON b2.staff_id = s.no
LEFT JOIN inst ON inst.staff_id = s.no
LEFT JOIN attendance sa ON sa.staff_id = s.no
WHERE COALESCE(s.staff_id, '') <> ALL($2::text[])
GROUP BY 
  s.no, s.staff_id, s.name, s.nick_name, s.ic, s.email, s.bank_name, s.acc_number, s.type, s.photo,
  b.total_com, b2.total, inst.total_installment, sa.attendance, sa.absent, sa.late, sa.mc, sa.hl, sa.q, sa.al, sa.el, sa.ul, sa.cl
ORDER BY s.no
`;

  const values = [
    month,
    SALARY_EXCLUDED_STAFF_IDS
  ];
  if (hasDateRange) {
    values.push(dateFrom, dateTo);
  }

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows;
};

const getSalaryDetail = async (req , month , staff_id, options = {} ) => {
  const dateFrom = options.dateFrom || null;
  const dateTo = options.dateTo || null;
  const hasDateRange = Boolean(dateFrom && dateTo);
  const dateFilterSql = hasDateRange
    ? `c.checkin_time >= $3::date AND c.checkin_time < ($4::date + INTERVAL '1 day')`
    : `(
      (
        $1 ~ '^\\d{4}-\\d{2}$'
        AND c.checkin_time >= to_date($1, 'YYYY-MM')
        AND c.checkin_time < (to_date($1, 'YYYY-MM') + INTERVAL '1 month')
      )
      OR (
        $1 !~ '^\\d{4}-\\d{2}$'
        AND c.checkin_time >= to_date($1, 'MM-YYYY')
        AND c.checkin_time < (to_date($1, 'MM-YYYY') + INTERVAL '1 month')
      )
    )`;

  const query = `SELECT 
    c.*, 
    b.name, 
    m.cafi_date, 
    m.colour, 
    m.chassis,
    m.model_description,
    COUNT(DISTINCT c2.staff_id) FILTER (WHERE UPPER(COALESCE(c2.position, '')) != 'TRAINEE') AS total_staff,
    selected_cs.position AS staff_position,
    STRING_AGG(DISTINCT s.nick_name, '+' ORDER BY s.nick_name) AS staff_list,
    COALESCE(SUM(DISTINCT t.price), 0) AS total_task_price,
    CASE
      WHEN UPPER(COALESCE(selected_cs.position, '')) = 'TRAINEE' THEN 0
      WHEN COUNT(DISTINCT c2.staff_id) FILTER (WHERE UPPER(COALESCE(c2.position, '')) != 'TRAINEE') = 0 THEN 0
      ELSE COALESCE(SUM(DISTINCT t.price), 0) / COUNT(DISTINCT c2.staff_id) FILTER (WHERE UPPER(COALESCE(c2.position, '')) != 'TRAINEE')
    END AS staff_production_price,
    STRING_AGG(DISTINCT t.short_name, '+' ORDER BY t.short_name) AS task_short_names
FROM checkin c
LEFT JOIN checkin_staff c2 ON c2.checkin_id = c.no
LEFT JOIN checkin_staff selected_cs ON selected_cs.checkin_id = c.no AND selected_cs.staff_id = $2
LEFT JOIN masterlist m ON m.no = c.masterlist_id
LEFT JOIN bay b ON b.no = c.bay_id
LEFT JOIN staff s ON s.no = c2.staff_id
LEFT JOIN task_item t ON t.masterlist_id = m.no AND t.type = c.type
WHERE 
    ${dateFilterSql}
    AND m.cancel_time IS NULL
    AND c.no IN (
        SELECT checkin_id 
        FROM checkin_staff 
        WHERE staff_id = $2
    )
GROUP BY 
    c.no, b.name, m.cafi_date, m.colour, m.chassis , m.model_description, selected_cs.position;

`;

  const values = [
    month , staff_id
  ];
  if (hasDateRange) {
    values.push(dateFrom, dateTo);
  }

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows;
};

const getSalaryDetailByBay = async (req , month , bay_id, date = null ) => {

  const query = `SELECT 
    c.*, 
    b.name, 
    m.cafi_date, 
    m.colour, 
    m.chassis,
    m.model_description,
    m.fitment_id,
    UPPER(LEFT(COALESCE(m.fitment_id, ''), 1)) AS fitment_type,
    COUNT(DISTINCT c2.staff_id) AS total_staff,
    STRING_AGG(DISTINCT s.nick_name, '+' ORDER BY s.nick_name) AS staff_list,
    COALESCE(task_duration.duration, 0) AS duration,
    COALESCE(SUM(DISTINCT t.price), 0) AS total_task_price,
    STRING_AGG(DISTINCT t.short_name, '+' ORDER BY t.short_name) AS task_short_names
  FROM checkin c
  LEFT JOIN checkin_staff c2 ON c2.checkin_id = c.no
  LEFT JOIN masterlist m ON m.no = c.masterlist_id
  LEFT JOIN bay b ON b.no = c.bay_id
  LEFT JOIN staff s ON s.no = c2.staff_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(ti.duration), 0) AS duration
    FROM task_item ti
    WHERE ti.masterlist_id = m.no AND ti.type = c.type
  ) task_duration ON true
  LEFT JOIN task_item t ON t.masterlist_id = m.no AND t.type = c.type
  WHERE 
      b.name = $2
      AND m.cancel_time IS NULL
      AND (
        ($3::date IS NOT NULL AND c.checkin_time::date = $3::date)
        OR (
          $3::date IS NULL
          AND c.checkin_time >= to_date($1, 'YYYY-MM')
          AND c.checkin_time < (to_date($1, 'YYYY-MM') + INTERVAL '1 month')
        )
      )
  GROUP BY 
      c.no, b.name, m.cafi_date, m.colour, m.chassis , m.model_description,   m.fitment_id, task_duration.duration
  `;

  const values = [
    month , bay_id, date || null
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  return result.rows;
};

const money = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const ensureSalaryFinanceTables = async (req) => {
  const pool = req.app.get('pool');
  const client = await pool.connect();

  try {
    await client.query(`SELECT pg_advisory_lock(hashtext('salary_finance_tables'))`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS staff_attendance (
        no BIGSERIAL PRIMARY KEY,
        staff_id INTEGER NOT NULL,
        month_label VARCHAR(20) NOT NULL,
        attendance NUMERIC(8,2) DEFAULT 0,
        absent NUMERIC(8,2) DEFAULT 0,
        late NUMERIC(8,2) DEFAULT 0,
        mc NUMERIC(8,2) DEFAULT 0,
        hl NUMERIC(8,2) DEFAULT 0,
        q NUMERIC(8,2) DEFAULT 0,
        al NUMERIC(8,2) DEFAULT 0,
        el NUMERIC(8,2) DEFAULT 0,
        ul NUMERIC(8,2) DEFAULT 0,
        cl NUMERIC(8,2) DEFAULT 0,
        CONSTRAINT fk_staff_attendance_staff
          FOREIGN KEY (staff_id) REFERENCES staff(no),
        CONSTRAINT uq_staff_month UNIQUE (staff_id, month_label)
      )
    `);

    await client.query(`
      ALTER TABLE staff_attendance
      ADD COLUMN IF NOT EXISTS absent NUMERIC(8,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS late NUMERIC(8,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS mc NUMERIC(8,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS hl NUMERIC(8,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS q NUMERIC(8,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS al NUMERIC(8,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS el NUMERIC(8,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS ul NUMERIC(8,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS cl NUMERIC(8,2) DEFAULT 0
    `);

    await client.query(`
      ALTER TABLE staff_attendance
      ALTER COLUMN attendance TYPE NUMERIC(8,2) USING attendance::numeric,
      ALTER COLUMN absent TYPE NUMERIC(8,2) USING absent::numeric,
      ALTER COLUMN late TYPE NUMERIC(8,2) USING late::numeric,
      ALTER COLUMN mc TYPE NUMERIC(8,2) USING mc::numeric,
      ALTER COLUMN hl TYPE NUMERIC(8,2) USING hl::numeric,
      ALTER COLUMN q TYPE NUMERIC(8,2) USING q::numeric,
      ALTER COLUMN al TYPE NUMERIC(8,2) USING al::numeric,
      ALTER COLUMN el TYPE NUMERIC(8,2) USING el::numeric,
      ALTER COLUMN ul TYPE NUMERIC(8,2) USING ul::numeric,
      ALTER COLUMN cl TYPE NUMERIC(8,2) USING cl::numeric
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS settlement_month (
        id BIGSERIAL PRIMARY KEY,
        month VARCHAR(7) UNIQUE NOT NULL,
        is_settled BOOLEAN DEFAULT false,
        settled_at TIMESTAMP WITHOUT TIME ZONE
      )
    `);

    await client.query(`
      ALTER TABLE settlement_month
      ALTER COLUMN month TYPE VARCHAR(7)
      USING LEFT(month::text, 7)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS salary_finance_inputs (
        id BIGSERIAL PRIMARY KEY,
        month VARCHAR(7) NOT NULL,
        staff_no BIGINT NOT NULL,
        staff_id VARCHAR(50),
        epf_11 NUMERIC(12,2) DEFAULT 0,
        epf_13 NUMERIC(12,2) DEFAULT 0,
        cash_advance_first NUMERIC(12,2) DEFAULT 0,
        cash_advance_second NUMERIC(12,2) DEFAULT 0,
        socso NUMERIC(12,2) DEFAULT 0,
        sip NUMERIC(12,2) DEFAULT 0,
        pcb NUMERIC(12,2) DEFAULT 0,
        defect_part_tools NUMERIC(12,2) DEFAULT 0,
        attendance_absenteeism NUMERIC(12,2) DEFAULT 0,
        incentive_deduction NUMERIC(12,2) DEFAULT 0,
        incentive_addition NUMERIC(12,2) DEFAULT 0,
        deposit NUMERIC(12,2) DEFAULT 0,
        deposit_release NUMERIC(12,2) DEFAULT 0,
        finance_remarks TEXT,
        imported_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
        UNIQUE (month, staff_no)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS salary_settlement_snapshot (
        id BIGSERIAL PRIMARY KEY,
        month VARCHAR(7) NOT NULL,
        staff_no BIGINT NOT NULL,
        staff_id VARCHAR(50),
        name TEXT,
        nick_name TEXT,
        ic TEXT,
        email TEXT,
        bank_name TEXT,
        acc_number TEXT,
        staff_type TEXT,
        photo TEXT,
        total_com NUMERIC(14,2) DEFAULT 0,
        total_deduct NUMERIC(14,2) DEFAULT 0,
        total_installment NUMERIC(14,2) DEFAULT 0,
        attendance NUMERIC(8,2) DEFAULT 0,
        absent NUMERIC(8,2) DEFAULT 0,
        late NUMERIC(8,2) DEFAULT 0,
        mc NUMERIC(8,2) DEFAULT 0,
        hl NUMERIC(8,2) DEFAULT 0,
        q NUMERIC(8,2) DEFAULT 0,
        al NUMERIC(8,2) DEFAULT 0,
        el NUMERIC(8,2) DEFAULT 0,
        ul NUMERIC(8,2) DEFAULT 0,
        cl NUMERIC(8,2) DEFAULT 0,
        base_pay NUMERIC(14,2) DEFAULT 0,
        production NUMERIC(14,2) DEFAULT 0,
        system_deduction NUMERIC(14,2) DEFAULT 0,
        final_balance_payment NUMERIC(14,2) DEFAULT 0,
        total_pay_out NUMERIC(14,2) DEFAULT 0,
        finance JSONB DEFAULT '{}'::jsonb,
        snapshot_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
        UNIQUE (month, staff_no)
      )
    `);

    await client.query(`
      ALTER TABLE salary_settlement_snapshot
      ADD COLUMN IF NOT EXISTS absent NUMERIC(8,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS late NUMERIC(8,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS mc NUMERIC(8,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS hl NUMERIC(8,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS q NUMERIC(8,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS al NUMERIC(8,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS el NUMERIC(8,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS ul NUMERIC(8,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS cl NUMERIC(8,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS deductible_absent NUMERIC(8,2),
      ADD COLUMN IF NOT EXISTS normal_absenteeism_deduction NUMERIC(14,2),
      ADD COLUMN IF NOT EXISTS attendance_absenteeism NUMERIC(14,2),
      ADD COLUMN IF NOT EXISTS absence_exception JSONB
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS salary_absence_exceptions (
        id BIGSERIAL PRIMARY KEY,
        month VARCHAR(7) NOT NULL,
        staff_no BIGINT NOT NULL REFERENCES staff(no),
        waive_deduction BOOLEAN NOT NULL DEFAULT true,
        approved_absent_days NUMERIC(8,2),
        special_remark TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_by BIGINT,
        updated_by BIGINT,
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
        revoked_at TIMESTAMP WITHOUT TIME ZONE,
        revoked_by BIGINT,
        UNIQUE (month, staff_no)
      )
    `);

    await client.query(`
      ALTER TABLE salary_absence_exceptions
      ADD COLUMN IF NOT EXISTS approved_absent_days NUMERIC(8,2)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_salary_absence_exceptions_month_status
      ON salary_absence_exceptions (month, status)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS salary_absence_exception_audit (
        id BIGSERIAL PRIMARY KEY,
        exception_id BIGINT NOT NULL REFERENCES salary_absence_exceptions(id),
        month VARCHAR(7) NOT NULL,
        staff_no BIGINT NOT NULL REFERENCES staff(no),
        action VARCHAR(20) NOT NULL,
        waive_deduction BOOLEAN NOT NULL,
        approved_absent_days NUMERIC(8,2),
        special_remark TEXT NOT NULL,
        action_by BIGINT,
        action_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
      )
    `);

    await client.query(`
      ALTER TABLE salary_absence_exception_audit
      ADD COLUMN IF NOT EXISTS approved_absent_days NUMERIC(8,2)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_salary_absence_exception_audit_lookup
      ON salary_absence_exception_audit (month, staff_no, action_at DESC)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS salary_base_pay_rules (
        id BIGSERIAL PRIMARY KEY,
        month VARCHAR(7) NOT NULL,
        min_days NUMERIC(8,2) NOT NULL,
        amount NUMERIC(14,2) NOT NULL DEFAULT 0,
        updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
        UNIQUE (month, min_days)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS salary_adjustments (
        id BIGSERIAL PRIMARY KEY,
        staff_id INTEGER NOT NULL REFERENCES staff(no),
        adjustment_type VARCHAR(30) NOT NULL,
        cv_code VARCHAR(100),
        amount NUMERIC(14,2) NOT NULL DEFAULT 0,
        mode VARCHAR(20) NOT NULL DEFAULT 'one_time',
        start_month VARCHAR(7) NOT NULL,
        installment_months INTEGER NOT NULL DEFAULT 1,
        remark TEXT,
        source_type VARCHAR(30),
        source_id BIGINT,
        source_ref VARCHAR(100),
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
      )
    `);

    await client.query(`
      ALTER TABLE salary_adjustments
      ADD COLUMN IF NOT EXISTS source_type VARCHAR(30),
      ADD COLUMN IF NOT EXISTS source_id BIGINT,
      ADD COLUMN IF NOT EXISTS source_ref VARCHAR(100)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS salary_adjustment_months (
        id BIGSERIAL PRIMARY KEY,
        adjustment_id BIGINT NOT NULL REFERENCES salary_adjustments(id) ON DELETE CASCADE,
        month VARCHAR(7) NOT NULL,
        amount NUMERIC(14,2) NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
        UNIQUE (adjustment_id, month)
      )
    `);
  } finally {
    await client.query(`SELECT pg_advisory_unlock(hashtext('salary_finance_tables'))`);
    client.release();
  }
};

const monthIndex = (month) => {
  const [year, monthNo] = String(month || '').split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(monthNo)) return null;
  return year * 12 + monthNo - 1;
};

const addMonths = (month, count) => {
  const [year, monthNo] = String(month || '').split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(monthNo)) return '';
  const date = new Date(year, monthNo - 1 + count, 1);
  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, '0');
  return `${nextYear}-${nextMonth}`;
};

const getAdjustmentMonths = ({ start_month, mode, installment_months, schedule_months }) => {
  const start = String(start_month || '').slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(start)) return [];
  if (mode === 'installment' && Array.isArray(schedule_months) && schedule_months.length > 0) {
    return schedule_months
      .map((month) => String(month || '').slice(0, 7))
      .filter((month) => /^\d{4}-\d{2}$/.test(month));
  }
  const count = mode === 'installment' ? Math.max(1, Number(installment_months || 1)) : 1;
  return Array.from({ length: count }, (_, index) => addMonths(start, index));
};

const normalizeAdjustmentPayload = (data = {}) => {
  const adjustmentType = String(data.adjustment_type || data.type || '').trim();
  const mode = data.mode === 'installment' ? 'installment' : 'one_time';
  const amount = money(data.amount);
  const months = mode === 'installment' ? Math.max(1, Number(data.installment_months || data.installment || 1)) : 1;
  const scheduleMonths = mode === 'installment' && Array.isArray(data.schedule_months)
    ? [...new Set(data.schedule_months
        .map((month) => String(month || '').slice(0, 7))
        .filter((month) => /^\d{4}-\d{2}$/.test(month)))]
    : [];

  return {
    staff_id: Number(data.staff_id || data.staff_jd),
    adjustment_type: adjustmentType,
    cv_code: adjustmentType === 'Cash Adv' ? String(data.cv_code || '').trim() : null,
    amount,
    mode,
    start_month: String(data.start_month || '').slice(0, 7),
    installment_months: months,
    schedule_months: scheduleMonths,
    remark: data.remark || '',
    source_type: data.source_type ? String(data.source_type).trim() : null,
    source_id: data.source_id ? Number(data.source_id) : null,
    source_ref: data.source_ref ? String(data.source_ref).trim().slice(0, 100) : null,
    status: data.status || 'active'
  };
};

const getSettledMonths = async (req, months = []) => {
  await ensureSalaryFinanceTables(req);
  const uniqueMonths = [...new Set(months.filter(Boolean))];
  if (uniqueMonths.length === 0) return [];

  const result = await req.app.get('pool').query(
    `
      SELECT LEFT(month::text, 7) AS month
      FROM settlement_month
      WHERE LEFT(month::text, 7) = ANY($1::text[])
        AND is_settled = true
    `,
    [uniqueMonths]
  );

  return result.rows.map((row) => row.month);
};

const insertAdjustment = async (req, data) => {
  await ensureSalaryFinanceTables(req);
  const item = normalizeAdjustmentPayload(data);

  if (!ADJUSTMENT_TYPES.includes(item.adjustment_type)) {
    throw new Error('Invalid adjustment type');
  }
  if (!Number.isInteger(item.staff_id) || item.staff_id <= 0) {
    throw new Error('Staff is required');
  }
  if (!/^\d{4}-\d{2}$/.test(item.start_month)) {
    throw new Error('Start month is required');
  }
  if (item.adjustment_type === 'Cash Adv' && !item.cv_code) {
    throw new Error('CV Code is required for Cash Adv');
  }

  if (item.mode === 'installment' && item.schedule_months.length > 0 && item.schedule_months.length !== item.installment_months) {
    throw new Error('Selected schedule month count must match installment period');
  }

  const client = await req.app.get('pool').connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `
        INSERT INTO salary_adjustments (
          staff_id, adjustment_type, cv_code, amount, mode, start_month,
          installment_months, remark, source_type, source_id, source_ref, status, created_at, updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'active',NOW(),NOW())
        RETURNING *
      `,
      [
        item.staff_id,
        item.adjustment_type,
        item.cv_code,
        item.amount,
        item.mode,
        item.start_month,
        item.installment_months,
        item.remark,
        item.source_type,
        item.source_id,
        item.source_ref
      ]
    );

    const adjustment = result.rows[0];
    if (item.mode === 'installment' && item.schedule_months.length > 0) {
      for (const month of item.schedule_months) {
        await client.query(
          `
            INSERT INTO salary_adjustment_months (adjustment_id, month, amount, status)
            VALUES ($1, $2, $3, 'active')
            ON CONFLICT (adjustment_id, month)
            DO UPDATE SET amount = EXCLUDED.amount, status = EXCLUDED.status
          `,
          [adjustment.id, month, item.amount]
        );
      }
    }

    await client.query('COMMIT');
    return {
      ...adjustment,
      schedule_months: item.schedule_months
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const getAdjustments = async (req) => {
  await ensureSalaryFinanceTables(req);

  const result = await req.app.get('pool').query(
    `
      SELECT a.*, s.name, s.staff_id AS staff_code,
        COALESCE(schedule.months, ARRAY[]::text[]) AS schedule_months,
        CASE
          WHEN array_length(schedule.months, 1) > 0 THEN schedule.months[array_length(schedule.months, 1)]
          WHEN a.mode = 'installment' THEN to_char((to_date(a.start_month, 'YYYY-MM') + ((a.installment_months - 1) || ' months')::interval), 'YYYY-MM')
          ELSE a.start_month
        END AS end_month
      FROM salary_adjustments a
      LEFT JOIN staff s ON s.no = a.staff_id
      LEFT JOIN LATERAL (
        SELECT ARRAY_AGG(sam.month ORDER BY sam.month) AS months
        FROM salary_adjustment_months sam
        WHERE sam.adjustment_id = a.id AND sam.status = 'active'
      ) schedule ON TRUE
      ORDER BY a.created_at DESC, a.id DESC
    `
  );

  return result.rows;
};

const getAdjustmentByNo = async (req, id) => {
  await ensureSalaryFinanceTables(req);

  const result = await req.app.get('pool').query(
    `
      SELECT a.*, s.name, s.staff_id AS staff_code,
        COALESCE(schedule.months, ARRAY[]::text[]) AS schedule_months,
        CASE
          WHEN array_length(schedule.months, 1) > 0 THEN schedule.months[array_length(schedule.months, 1)]
          WHEN a.mode = 'installment' THEN to_char((to_date(a.start_month, 'YYYY-MM') + ((a.installment_months - 1) || ' months')::interval), 'YYYY-MM')
          ELSE a.start_month
        END AS end_month
      FROM salary_adjustments a
      LEFT JOIN staff s ON s.no = a.staff_id
      LEFT JOIN LATERAL (
        SELECT ARRAY_AGG(sam.month ORDER BY sam.month) AS months
        FROM salary_adjustment_months sam
        WHERE sam.adjustment_id = a.id AND sam.status = 'active'
      ) schedule ON TRUE
      WHERE a.id = $1
    `,
    [id]
  );

  return result.rows[0] || null;
};

const getAdjustmentAffectedMonths = (adjustment = {}) => {
  if (Array.isArray(adjustment.schedule_months) && adjustment.schedule_months.length > 0) {
    return adjustment.schedule_months
      .map((month) => String(month || '').slice(0, 7))
      .filter((month) => /^\d{4}-\d{2}$/.test(month));
  }
  return getAdjustmentMonths(adjustment);
};

const assertAdjustmentMonthsOpen = async (req, adjustment) => {
  const months = getAdjustmentAffectedMonths(adjustment);
  const settledMonths = await getSettledMonths(req, months);
  if (settledMonths.length > 0) {
    const error = new Error(`Cannot change adjustment. Settled month(s): ${settledMonths.join(', ')}`);
    error.status = 400;
    throw error;
  }
};

const updateAdjustment = async (req, id, data = {}) => {
  await ensureSalaryFinanceTables(req);
  const existing = await getAdjustmentByNo(req, id);
  if (!existing) {
    const error = new Error('Adjustment not found');
    error.status = 404;
    throw error;
  }
  await assertAdjustmentMonthsOpen(req, existing);

  const nextAmount = data.amount !== undefined ? money(data.amount) : money(existing.amount);
  const nextRemark = data.remark !== undefined ? String(data.remark || '') : existing.remark;
  const nextCvCode = existing.adjustment_type === 'Cash Adv'
    ? String(data.cv_code !== undefined ? data.cv_code || '' : existing.cv_code || '').trim()
    : existing.cv_code;

  if (existing.adjustment_type === 'Cash Adv' && !nextCvCode) {
    const error = new Error('CV Code is required for Cash Adv');
    error.status = 400;
    throw error;
  }

  const client = await req.app.get('pool').connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `
        UPDATE salary_adjustments
        SET amount = $1,
            remark = $2,
            cv_code = $3,
            updated_at = NOW()
        WHERE id = $4
        RETURNING *
      `,
      [nextAmount, nextRemark, nextCvCode, id]
    );

    await client.query(
      `
        UPDATE salary_adjustment_months
        SET amount = $1
        WHERE adjustment_id = $2
          AND status = 'active'
      `,
      [nextAmount, id]
    );

    await client.query('COMMIT');
    return {
      ...result.rows[0],
      schedule_months: existing.schedule_months || []
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const cancelAdjustment = async (req, id) => {
  await ensureSalaryFinanceTables(req);
  const existing = await getAdjustmentByNo(req, id);
  if (!existing) {
    const error = new Error('Adjustment not found');
    error.status = 404;
    throw error;
  }
  await assertAdjustmentMonthsOpen(req, existing);

  const result = await req.app.get('pool').query(
    `
      UPDATE salary_adjustments
      SET status = 'cancelled',
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [id]
  );

  await req.app.get('pool').query(
    `
      UPDATE salary_adjustment_months
      SET status = 'cancelled'
      WHERE adjustment_id = $1
    `,
    [id]
  );

  return result.rows[0];
};

const getAdjustmentsBySource = async (req, { source_type, source_id }) => {
  await ensureSalaryFinanceTables(req);

  const result = await req.app.get('pool').query(
    `
      SELECT a.*, s.name, s.nick_name, s.staff_id AS staff_code,
        COALESCE(schedule.months, ARRAY[]::text[]) AS schedule_months,
        CASE
          WHEN array_length(schedule.months, 1) > 0 THEN schedule.months[array_length(schedule.months, 1)]
          WHEN a.mode = 'installment' THEN to_char((to_date(a.start_month, 'YYYY-MM') + ((a.installment_months - 1) || ' months')::interval), 'YYYY-MM')
          ELSE a.start_month
        END AS end_month
      FROM salary_adjustments a
      LEFT JOIN staff s ON s.no = a.staff_id
      LEFT JOIN LATERAL (
        SELECT ARRAY_AGG(sam.month ORDER BY sam.month) AS months
        FROM salary_adjustment_months sam
        WHERE sam.adjustment_id = a.id AND sam.status = 'active'
      ) schedule ON TRUE
      WHERE a.source_type = $1
        AND a.source_id = $2
        AND a.status = 'active'
      ORDER BY a.created_at DESC, a.id DESC
    `,
    [source_type, source_id]
  );

  return result.rows;
};

const getSalaryAdjustmentsForMonth = async (req, month, staffNo = null) => {
  await ensureSalaryFinanceTables(req);
  const selectedIdx = monthIndex(month);
  if (selectedIdx === null) return {};

  const values = [month];
  let staffFilter = '';
  if (staffNo) {
    values.push(staffNo);
    staffFilter = `AND staff_id = $2`;
  }

  const result = await req.app.get('pool').query(
    `
      SELECT *
      FROM salary_adjustments
      WHERE id IN (
        SELECT a.id
        FROM salary_adjustments a
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS schedule_count
          FROM salary_adjustment_months sam
          WHERE sam.adjustment_id = a.id AND sam.status = 'active'
        ) schedule ON TRUE
        WHERE a.status = 'active'
          AND (
            (
              schedule.schedule_count > 0
              AND EXISTS (
                SELECT 1
                FROM salary_adjustment_months sam
                WHERE sam.adjustment_id = a.id
                  AND sam.month = $1
                  AND sam.status = 'active'
              )
            )
            OR (
              schedule.schedule_count = 0
              AND a.start_month <= $1
              AND (
                (a.mode = 'one_time' AND a.start_month = $1)
                OR (
                  a.mode = 'installment'
                  AND to_date($1, 'YYYY-MM') < to_date(a.start_month, 'YYYY-MM') + (a.installment_months || ' months')::interval
                )
              )
            )
          )
          ${staffFilter ? `AND a.staff_id = $2` : ''}
      )
    `,
    values
  );

  const grouped = {};
  for (const row of result.rows) {
    const staffId = Number(row.staff_id);
    if (!grouped[staffId]) {
      grouped[staffId] = {
        port_fitment: 0,
        incentive_deduction: 0,
        cash_advance_second: 0,
        deposit_release: 0,
        incentive_addition: 0,
        defect_part_tools: 0,
        rows: []
      };
    }

    const amount = money(row.amount);
    const absAmount = Math.abs(amount);
    if (row.adjustment_type === 'Port') grouped[staffId].port_fitment += amount;
    if (row.adjustment_type === 'Deduct') grouped[staffId].incentive_deduction += absAmount;
    if (row.adjustment_type === 'Cash Adv') grouped[staffId].cash_advance_second += absAmount;
    if (row.adjustment_type === 'Released') grouped[staffId].deposit_release += amount;
    if (row.adjustment_type === 'Adj 1' && amount >= 0) grouped[staffId].incentive_addition += amount;
    if (row.adjustment_type === 'Adj 1' && amount < 0) grouped[staffId].incentive_deduction += absAmount;
    if (row.adjustment_type === 'Defect' || row.adjustment_type === 'Part&Tools') grouped[staffId].defect_part_tools += absAmount;
    grouped[staffId].rows.push(row);
  }

  return grouped;
};

const normalizeBasePayRules = (rules = []) => {
  const normalized = (Array.isArray(rules) ? rules : [])
    .map((rule) => ({
      min_days: money(rule.min_days),
      amount: money(rule.amount)
    }))
    .filter((rule) => Number.isFinite(rule.min_days) && rule.min_days >= 0)
    .sort((a, b) => a.min_days - b.min_days);

  return normalized.length > 0 ? normalized : DEFAULT_BASE_PAY_RULES;
};

const getSalaryBasePayRules = async (req, month) => {
  await ensureSalaryFinanceTables(req);

  const result = await req.app.get('pool').query(
    `
      SELECT min_days::numeric AS min_days, amount::numeric AS amount
      FROM salary_base_pay_rules
      WHERE month = $1
      ORDER BY min_days ASC
    `,
    [month]
  );

  const rows = result.rows.map((row) => ({
    min_days: Number(row.min_days || 0),
    amount: Number(row.amount || 0)
  }));

  return {
    month,
    is_default: rows.length === 0,
    rules: normalizeBasePayRules(rows)
  };
};

const upsertSalaryBasePayRules = async (req, month, rules = []) => {
  await ensureSalaryFinanceTables(req);

  const normalized = normalizeBasePayRules(rules);
  const client = await req.app.get('pool').connect();

  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM salary_base_pay_rules WHERE month = $1`, [month]);

    for (const rule of normalized) {
      await client.query(
        `
          INSERT INTO salary_base_pay_rules (month, min_days, amount, updated_at)
          VALUES ($1, $2, $3, NOW())
        `,
        [month, rule.min_days, rule.amount]
      );
    }

    await client.query('COMMIT');

    return {
      month,
      is_default: false,
      rules: normalized
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const getSalaryMonthStatusData = async (req, month) => {
  await ensureSalaryFinanceTables(req);

  const result = await req.app.get('pool').query(
    `
      SELECT
        $1::text AS month,
        EXISTS (
          SELECT 1 FROM settlement_month
          WHERE LEFT(month::text, 7) = $1 AND is_settled = true
        ) AS is_settled,
        COALESCE((
          SELECT COUNT(*)::int FROM staff_attendance
          WHERE LEFT(month_label::text, 7) = $1
        ), 0) AS attendance_count,
        COALESCE((
          SELECT COUNT(*)::int FROM salary_finance_inputs
          WHERE LEFT(month::text, 7) = $1
        ), 0) AS finance_count,
        COALESCE((
          SELECT COUNT(*)::int FROM salary_absence_exceptions
          WHERE month = $1 AND status = 'active'
        ), 0) AS absence_exception_count
    `,
    [month]
  );

  const row = result.rows[0] || {};
  const isSettled = Boolean(row.is_settled);
  const financeCount = Number(row.finance_count || 0);
  const attendanceCount = Number(row.attendance_count || 0);
  const absenceExceptionCount = Number(row.absence_exception_count || 0);
  const status = isSettled
    ? 'Settled'
    : financeCount > 0
      ? 'Finance Imported'
      : attendanceCount > 0
        ? 'Attendance Uploaded'
        : 'Draft';

  return {
    month,
    status,
    is_settled: isSettled,
    attendance_count: attendanceCount,
    finance_count: financeCount,
    absence_exception_count: absenceExceptionCount
  };
};

const getSalaryAbsenceExceptions = async (req, month, staffNo = null) => {
  await ensureSalaryFinanceTables(req);

  const values = [month];
  const staffFilter = staffNo == null ? '' : `AND sae.staff_no = $2`;
  if (staffNo != null) values.push(Number(staffNo));

  const result = await req.app.get('pool').query(
    `
      SELECT
        sae.*,
        s.staff_id,
        COALESCE(s.nick_name, s.name, '') AS staff_name,
        COALESCE(sa.absent, 0)::numeric AS absent
      FROM salary_absence_exceptions sae
      JOIN staff s ON s.no = sae.staff_no
      LEFT JOIN staff_attendance sa
        ON sa.staff_id = sae.staff_no
        AND LEFT(sa.month_label::text, 7) = sae.month
      WHERE sae.month = $1
        AND sae.status = 'active'
        ${staffFilter}
      ORDER BY s.staff_id, sae.staff_no
    `,
    values
  );

  return result.rows;
};

const getSalaryAbsenceException = async (req, month, staffNo) => {
  const rows = await getSalaryAbsenceExceptions(req, month, staffNo);
  return rows[0] || null;
};

const upsertSalaryAbsenceException = async (req, input, actorId = null) => {
  await ensureSalaryFinanceTables(req);
  const item = normalizeAbsenceExceptionInput(input);
  const client = await req.app.get('pool').connect();

  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`salary-settlement:${item.month}`]);

    const settled = await client.query(
      `SELECT 1 FROM settlement_month WHERE month = $1 AND is_settled = true LIMIT 1`,
      [item.month]
    );
    if (settled.rowCount > 0) {
      throw errorWithStatus(`${item.month} is settled and absence exceptions cannot be changed.`);
    }

    const attendance = await client.query(
      `
        SELECT s.no, COALESCE(sa.absent, 0)::numeric AS absent
        FROM staff s
        LEFT JOIN staff_attendance sa
          ON sa.staff_id = s.no
          AND LEFT(sa.month_label::text, 7) = $1
        WHERE s.no = $2
        LIMIT 1
      `,
      [item.month, item.staff_no]
    );
    if (attendance.rowCount === 0) {
      throw errorWithStatus('Staff not found', 404);
    }
    const actualAbsentDays = Number(attendance.rows[0].absent || 0);
    if (actualAbsentDays <= 0) {
      throw errorWithStatus('An absence exception requires at least one absent day');
    }
    const approvedAbsentDays = item.approved_absent_days == null
      ? actualAbsentDays
      : Number(item.approved_absent_days);
    if (approvedAbsentDays > actualAbsentDays) {
      throw errorWithStatus('Approved absent days cannot exceed actual absent days');
    }
    const waiveDeduction = approvedAbsentDays >= actualAbsentDays;

    const result = await client.query(
      `
        INSERT INTO salary_absence_exceptions (
          month, staff_no, waive_deduction, approved_absent_days, special_remark, status,
          created_by, updated_by, created_at, updated_at, revoked_at, revoked_by
        )
        VALUES ($1, $2, $3, $4, $5, 'active', $6, $6, NOW(), NOW(), NULL, NULL)
        ON CONFLICT (month, staff_no)
        DO UPDATE SET
          waive_deduction = EXCLUDED.waive_deduction,
          approved_absent_days = EXCLUDED.approved_absent_days,
          special_remark = EXCLUDED.special_remark,
          status = 'active',
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW(),
          revoked_at = NULL,
          revoked_by = NULL
        RETURNING *
      `,
      [item.month, item.staff_no, waiveDeduction, approvedAbsentDays, item.special_remark, actorId]
    );

    await client.query(
      `
        INSERT INTO salary_absence_exception_audit (
          exception_id, month, staff_no, action, waive_deduction,
          approved_absent_days, special_remark, action_by, action_at
        )
        VALUES ($1, $2, $3, 'saved', $4, $5, $6, $7, NOW())
      `,
      [result.rows[0].id, item.month, item.staff_no, waiveDeduction, approvedAbsentDays, item.special_remark, actorId]
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const revokeSalaryAbsenceException = async (req, input, actorId = null) => {
  const month = String(input?.month || '').trim();
  const staffNo = Number(input?.staff_no);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw errorWithStatus('A valid month in YYYY-MM format is required');
  if (!Number.isInteger(staffNo) || staffNo <= 0) throw errorWithStatus('A valid staff number is required');

  await ensureSalaryFinanceTables(req);
  const client = await req.app.get('pool').connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`salary-settlement:${month}`]);
    const settled = await client.query(
      `SELECT 1 FROM settlement_month WHERE month = $1 AND is_settled = true LIMIT 1`,
      [month]
    );
    if (settled.rowCount > 0) {
      throw errorWithStatus(`${month} is settled and absence exceptions cannot be changed.`);
    }

    const result = await client.query(
      `
        UPDATE salary_absence_exceptions
        SET status = 'revoked',
            updated_by = $3,
            updated_at = NOW(),
            revoked_at = NOW(),
            revoked_by = $3
        WHERE month = $1 AND staff_no = $2 AND status = 'active'
        RETURNING *
      `,
      [month, staffNo, actorId]
    );
    if (result.rowCount === 0) throw errorWithStatus('Active absence exception not found', 404);

    await client.query(
      `
        INSERT INTO salary_absence_exception_audit (
          exception_id, month, staff_no, action, waive_deduction,
          approved_absent_days, special_remark, action_by, action_at
        )
        VALUES ($1, $2, $3, 'revoked', false, $4, $5, $6, NOW())
      `,
      [result.rows[0].id, month, staffNo, result.rows[0].approved_absent_days, result.rows[0].special_remark, actorId]
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const getFinanceInputByStaff = async (req, month, staffNo) => {
  await ensureSalaryFinanceTables(req);

  const result = await req.app.get('pool').query(
    `SELECT * FROM salary_finance_inputs WHERE month = $1 AND staff_no = $2`,
    [month, staffNo]
  );

  return result.rows[0] || null;
};

const getSalarySnapshotByStaff = async (req, month, staffNo) => {
  await ensureSalaryFinanceTables(req);

  const result = await req.app.get('pool').query(
    `SELECT * FROM salary_settlement_snapshot WHERE month = $1 AND staff_no = $2 LIMIT 1`,
    [month, staffNo]
  );

  return result.rows[0] || null;
};

const resolveStaffNo = async (client, staffId) => {
  const result = await client.query(
    `
      SELECT no, staff_id, name, nick_name, ic, bank_name, acc_number
      FROM staff
      WHERE no::text = $1 OR staff_id::text = $1
      LIMIT 1
    `,
    [String(staffId || '')]
  );

  return result.rows[0] || null;
};

const upsertSalaryFinanceInputs = async (req, month, rows = []) => {
  await ensureSalaryFinanceTables(req);

  const client = await req.app.get('pool').connect();
  const imported = [];
  const errors = [];

  try {
    const settled = await client.query(
      `SELECT 1 FROM settlement_month WHERE LEFT(month::text, 7) = $1 AND is_settled = true LIMIT 1`,
      [month]
    );

    if (settled.rowCount > 0) {
      return {
        imported,
        errors: [{ row: 0, message: `${month} is settled and cannot be changed.` }]
      };
    }

    await client.query('BEGIN');

    for (let i = 0; i < rows.length; i += 1) {
      const input = rows[i] || {};
      const staffKey = input.staff_no || input.no || input.staff_id || input['Staff ID'] || input['Staff Id'];
      const staff = await resolveStaffNo(client, staffKey);

      if (!staff) {
        errors.push({ row: i + 2, staff_id: staffKey || '', message: 'Staff not found' });
        continue;
      }

      const values = [
        month,
        staff.no,
        staff.staff_id,
        money(input.epf_11),
        money(input.epf_13),
        money(input.cash_advance_first),
        money(input.cash_advance_second),
        money(input.socso),
        money(input.sip),
        money(input.pcb),
        money(input.defect_part_tools),
        0,
        money(input.incentive_deduction),
        money(input.incentive_addition),
        money(input.deposit),
        money(input.deposit_release),
        input.finance_remarks || ''
      ];

      const result = await client.query(
        `
          INSERT INTO salary_finance_inputs (
            month, staff_no, staff_id, epf_11, epf_13, cash_advance_first, cash_advance_second,
            socso, sip, pcb, defect_part_tools, attendance_absenteeism, incentive_deduction,
            incentive_addition, deposit, deposit_release, finance_remarks, imported_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
          ON CONFLICT (month, staff_no)
          DO UPDATE SET
            staff_id = EXCLUDED.staff_id,
            epf_11 = EXCLUDED.epf_11,
            epf_13 = EXCLUDED.epf_13,
            cash_advance_first = EXCLUDED.cash_advance_first,
            cash_advance_second = EXCLUDED.cash_advance_second,
            socso = EXCLUDED.socso,
            sip = EXCLUDED.sip,
            pcb = EXCLUDED.pcb,
            defect_part_tools = EXCLUDED.defect_part_tools,
            attendance_absenteeism = EXCLUDED.attendance_absenteeism,
            incentive_deduction = EXCLUDED.incentive_deduction,
            incentive_addition = EXCLUDED.incentive_addition,
            deposit = EXCLUDED.deposit,
            deposit_release = EXCLUDED.deposit_release,
            finance_remarks = EXCLUDED.finance_remarks,
            imported_at = NOW()
          RETURNING *
        `,
        values
      );

      imported.push(result.rows[0]);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return { imported, errors };
};

const insertSettlement = async (req , month, snapshotRows = [] ) => {

  await ensureSalaryFinanceTables(req);
  const pool = req.app.get('pool');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const settled = await client.query(
      `SELECT 1 FROM settlement_month WHERE LEFT(month::text, 7) = $1 AND is_settled = true LIMIT 1`,
      [month]
    );

    if (settled.rowCount > 0) {
      const existing = await client.query(
        `SELECT * FROM salary_settlement_snapshot WHERE month = $1 ORDER BY staff_no`,
        [month]
      );
      await client.query('COMMIT');
      return {
        settlement: [],
        snapshot_count: existing.rowCount,
        already_settled: true
      };
    }

    const settlementResult = await client.query(
      `
        INSERT INTO settlement_month (month , is_settled , settled_at )
        VALUES ($1 , $2, $3)
        ON CONFLICT (month)
        DO UPDATE SET is_settled = true, settled_at = EXCLUDED.settled_at
        RETURNING *
      `,
      [month, true, new Date()]
    );

    for (const row of snapshotRows) {
      await client.query(
        `
          INSERT INTO salary_settlement_snapshot (
            month, staff_no, staff_id, name, nick_name, ic, email, bank_name, acc_number,
            staff_type, photo, total_com, total_deduct, total_installment, attendance, absent,
            late, mc, hl, q, al, el, ul, cl,
            base_pay, production, system_deduction, final_balance_payment, total_pay_out,
            deductible_absent, normal_absenteeism_deduction, attendance_absenteeism,
            absence_exception, finance, snapshot_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9,
            $10, $11, $12, $13, $14, $15, $16,
            $17, $18, $19, $20, $21, $22, $23, $24,
            $25, $26, $27, $28, $29,
            $30, $31, $32,
            $33::jsonb, $34::jsonb, NOW()
          )
          ON CONFLICT (month, staff_no)
          DO UPDATE SET
            staff_id = EXCLUDED.staff_id,
            name = EXCLUDED.name,
            nick_name = EXCLUDED.nick_name,
            ic = EXCLUDED.ic,
            email = EXCLUDED.email,
            bank_name = EXCLUDED.bank_name,
            acc_number = EXCLUDED.acc_number,
            staff_type = EXCLUDED.staff_type,
            photo = EXCLUDED.photo,
            total_com = EXCLUDED.total_com,
            total_deduct = EXCLUDED.total_deduct,
            total_installment = EXCLUDED.total_installment,
            attendance = EXCLUDED.attendance,
            absent = EXCLUDED.absent,
            late = EXCLUDED.late,
            mc = EXCLUDED.mc,
            hl = EXCLUDED.hl,
            q = EXCLUDED.q,
            al = EXCLUDED.al,
            el = EXCLUDED.el,
            ul = EXCLUDED.ul,
            cl = EXCLUDED.cl,
            base_pay = EXCLUDED.base_pay,
            production = EXCLUDED.production,
            system_deduction = EXCLUDED.system_deduction,
            final_balance_payment = EXCLUDED.final_balance_payment,
            total_pay_out = EXCLUDED.total_pay_out,
            deductible_absent = EXCLUDED.deductible_absent,
            normal_absenteeism_deduction = EXCLUDED.normal_absenteeism_deduction,
            attendance_absenteeism = EXCLUDED.attendance_absenteeism,
            absence_exception = EXCLUDED.absence_exception,
            finance = EXCLUDED.finance,
            snapshot_at = EXCLUDED.snapshot_at
        `,
        [
          month,
          row.no,
          row.staff_id,
          row.name,
          row.nick_name,
          row.ic,
          row.email,
          row.bank_name,
          row.acc_number,
          row.type,
          row.photo,
          row.total_com,
          row.total_deduct,
          row.total_installment,
          row.attendance,
          row.absent,
          row.late,
          row.mc,
          row.hl,
          row.q,
          row.al,
          row.el,
          row.ul,
          row.cl,
          row.base_pay,
          row.production,
          row.system_deduction,
          row.final_balance_payment,
          row.total_pay_out,
          row.deductible_absent,
          row.normal_absenteeism_deduction,
          row.attendance_absenteeism,
          JSON.stringify(row.absence_exception || null),
          JSON.stringify(row.finance || {})
        ]
      );
    }

    await client.query('COMMIT');
    return {
      settlement: settlementResult.rows,
      snapshot_count: snapshotRows.length,
      already_settled: false
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
// INSERT INTO settlement_month (month , is_settled , settled_at )

module.exports = {
  insertInstallment,
  getInstallment,
  getInstallmentByNo,
  getSalaryResult,
  getSalaryDetail,
  insertSettlement,
  getSalaryDetailByBay,
  getSalaryMonthStatusData,
  getSalaryAbsenceExceptions,
  getSalaryAbsenceException,
  upsertSalaryAbsenceException,
  revokeSalaryAbsenceException,
  getFinanceInputByStaff,
  getSalarySnapshotByStaff,
  getSalarySnapshotRows,
  resolveStaffNo,
  upsertSalaryFinanceInputs,
  getSalaryBasePayRules,
  upsertSalaryBasePayRules,
  DEFAULT_BASE_PAY_RULES,
  insertAdjustment,
  getAdjustments,
  getAdjustmentByNo,
  updateAdjustment,
  cancelAdjustment,
  getAdjustmentsBySource,
  getAdjustmentMonths,
  getSettledMonths,
  getSalaryAdjustmentsForMonth
};
