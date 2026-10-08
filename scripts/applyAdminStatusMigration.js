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
    const sql = fs.readFileSync(path.join(__dirname, '..', 'postgreSQL', 'admin_status.sql'), 'utf8');
    await pool.query(sql);
    console.log('Admin status migration applied');
  } finally {
    await pool.end();
  }
};

run().catch((error) => {
  console.error('Admin status migration failed:', error.message);
  process.exitCode = 1;
});
