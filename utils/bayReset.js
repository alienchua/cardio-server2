const resetBayAssignments = async (pool) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cleared = await client.query('DELETE FROM baycurrent');
    const result = await client.query(
      `
      SELECT b.no AS bay_id, s.no AS staff_id
      FROM staff s
      LEFT JOIN bay b ON b.name = s.bay
      WHERE s.bay IS NOT NULL
      `
    );
    let inserted = 0;
    for (const row of result.rows) {
      if (!row?.bay_id || !row?.staff_id) continue;
      await client.query(
        'INSERT INTO baycurrent (staff_id, bay_id) VALUES ($1, $2)',
        [row.staff_id, row.bay_id]
      );
      inserted += 1;
    }
    await client.query('COMMIT');
    return {
      cleared: cleared?.rowCount || 0,
      inserted
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  resetBayAssignments
};
