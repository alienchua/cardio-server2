const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function run() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(fs.readFileSync(path.join(__dirname, '..', 'postgreSQL', 'ca_line_check.sql'), 'utf8'));
    console.log('CA line check migration applied');
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error('CA line check migration failed:', error.message);
  process.exitCode = 1;
});
