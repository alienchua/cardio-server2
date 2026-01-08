require('dotenv').config();

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

const getSalaryResult = async (req , month ) => {

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
    WHERE position != 'TRAINEE'
    GROUP BY checkin_id
  ) cs ON cs.checkin_id = c.no
  LEFT JOIN (
    SELECT masterlist_id, type, SUM(price) AS total_price
    FROM task_item
    GROUP BY masterlist_id, type
  ) ti ON ti.masterlist_id = c.masterlist_id AND ti.type = c.type
  WHERE TO_CHAR(c.created_at, 'YYYY-MM') =  $1
),
builddata AS (
  SELECT 
    cs.staff_id, 
    SUM(sd.total_com) AS total_com
  FROM checkin_staff cs
  LEFT JOIN selectdata sd ON sd.checkin_no = cs.checkin_id
  GROUP BY cs.staff_id
),
builddata2 AS (
  SELECT staff_id, SUM(amount2 + amount) as total 
  FROM task_offset 
  WHERE TO_CHAR(created_at, 'YYYY-MM') =  $1
  GROUP BY staff_id
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
  SELECT staff_id, MAX(attendance) AS attendance
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
  COALESCE(sa.attendance, 0) AS attendance
FROM staff s
LEFT JOIN builddata b ON s.no = b.staff_id
LEFT JOIN builddata2 b2 ON b2.staff_id = s.no
LEFT JOIN inst ON inst.staff_id = s.no
LEFT JOIN attendance sa ON sa.staff_id = s.no
GROUP BY 
  s.no, s.staff_id, s.name, s.nick_name, s.ic, s.email, s.bank_name, s.acc_number, s.type, s.photo,
  b.total_com, b2.total, inst.total_installment, sa.attendance
ORDER BY s.no
`;

  const values = [
    month
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows;
};

const getSalaryDetail = async (req , month , staff_id ) => {

  const query = `SELECT 
    c.*, 
    b.name, 
    m.cafi_date, 
    m.colour, 
    m.chassis,
    m.model_description,
    COUNT(DISTINCT c2.staff_id) AS total_staff,
 STRING_AGG(DISTINCT s.nick_name, '+' ORDER BY s.nick_name) AS staff_list,
    COALESCE(SUM(DISTINCT t.price), 0) AS total_task_price,
    STRING_AGG(DISTINCT t.short_name, '+' ORDER BY t.short_name) AS task_short_names
FROM checkin c
LEFT JOIN checkin_staff c2 ON c2.checkin_id = c.no
LEFT JOIN masterlist m ON m.no = c.masterlist_id
LEFT JOIN bay b ON b.no = c.bay_id
LEFT JOIN staff s ON s.no = c2.staff_id
LEFT JOIN task_item t ON t.masterlist_id = m.no AND t.type = c.type
WHERE 
    TO_CHAR(c.created_at, 'MM-YYYY') = $1
    AND c.no IN (
        SELECT checkin_id 
        FROM checkin_staff 
        WHERE staff_id = $2
    )
GROUP BY 
    c.no, b.name, m.cafi_date, m.colour, m.chassis , m.model_description;

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

const getSalaryDetailByBay = async (req , month , bay_id ) => {

  const query = `SELECT 
    c.*, 
    b.name, 
    m.cafi_date, 
    m.colour, 
    m.chassis,
    m.model_description,
    m.fitment_id,
    COUNT(DISTINCT c2.staff_id) AS total_staff,
    STRING_AGG(DISTINCT s.nick_name, '+' ORDER BY s.nick_name) AS staff_list,
    COALESCE(SUM(DISTINCT t.price), 0) AS total_task_price,
    STRING_AGG(DISTINCT t.short_name, '+' ORDER BY t.short_name) AS task_short_names
  FROM checkin c
  LEFT JOIN checkin_staff c2 ON c2.checkin_id = c.no
  LEFT JOIN masterlist m ON m.no = c.masterlist_id
  LEFT JOIN bay b ON b.no = c.bay_id
  LEFT JOIN staff s ON s.no = c2.staff_id
  LEFT JOIN task_item t ON t.masterlist_id = m.no AND t.type = c.type
  WHERE 
      TO_CHAR(c.created_at, 'YYYY-MM') = $1
      AND b.name = $2
  GROUP BY 
      c.no, b.name, m.cafi_date, m.colour, m.chassis , m.model_description,   m.fitment_id
  `;

  const values = [
    month , bay_id
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  return result.rows;
};

const insertSettlement = async (req , month ) => {

  const query = `INSERT INTO settlement_month (month , is_settled , settled_at ) VALUES ($1 , $2, $3)`;

  const values = [
    month ,
    true,
    new Date()
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows;
};
// INSERT INTO settlement_month (month , is_settled , settled_at )

module.exports = {
  insertInstallment,
  getInstallment,
  getInstallmentByNo,
  getSalaryResult,
  getSalaryDetail,
  insertSettlement,
  getSalaryDetailByBay
};
