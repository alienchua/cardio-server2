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



module.exports = {
  selectBayStaff,
  getBayCheckinListByStatus
};