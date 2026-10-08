const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function run() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(fs.readFileSync(path.join(__dirname, '..', 'postgreSQL', 'defect_approval.sql'), 'utf8'));
    console.log('Defect approval migration applied');
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error('Defect approval migration failed:', error.message);
  process.exitCode = 1;
});
