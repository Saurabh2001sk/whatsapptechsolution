const { Pool } = require('pg');

const hasDatabase = Boolean(process.env.DATABASE_URL);

const pool = hasDatabase
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
    })
  : null;

async function query(text, params) {
  if (!pool) {
    throw new Error('DATABASE_URL is not configured');
  }
  return pool.query(text, params);
}

module.exports = {
  hasDatabase,
  query,
};
