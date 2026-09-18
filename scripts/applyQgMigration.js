const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const run = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured');
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'postgreSQL', 'qg_schema.sql'), 'utf8');
    await pool.query(sql);
    const result = await pool.query(`
      SELECT
        to_regclass('public.qg_job') IS NOT NULL AS qg_job,
        to_regclass('public.qg_inspection') IS NOT NULL AS qg_inspection,
        COUNT(*)::int AS issue_count
      FROM qg_defect_issue
    `);
    console.log('QG migration applied', result.rows[0]);
  } finally {
    await pool.end();
  }
};

run().catch((error) => {
  console.error('QG migration failed:', error.message);
  process.exitCode = 1;
});
