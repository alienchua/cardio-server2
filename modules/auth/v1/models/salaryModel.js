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

  const query = `SELECT i.* , s.name FROM installment i LEFT JOIN  staff s ON i.staff_id = s.no`;

  const values = [
  ];

  const result = await req.app.get('pool').query(
    query,
    values
  );
  // const res = await req.query(query, values);
  return result.rows;
};

const getSalaryResult = async (req  ) => {

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
SELECT sum(amount2 + amount) as total , staff_id FROM task_offset GROUP BY staff_id
)
SELECT 
  s.*, 
  COALESCE(b.total_com, 0) AS total_com,
  COALESCE(b2.total, 0) AS total_deduct
FROM staff s
LEFT JOIN builddata b ON s.no = b.staff_id
LEFT JOIN builddata2 b2 ON b2.staff_id = s.no
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

module.exports = {
  insertInstallment,
  getInstallment,
  getSalaryResult
};