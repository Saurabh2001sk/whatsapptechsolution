const { Pool } = require('pg');

const hasDatabase = Boolean(process.env.DATABASE_URL);
const isProduction = process.env.NODE_ENV === 'production';

function shouldUseSsl() {
  if (!isProduction) return false;

  const databaseUrl = String(process.env.DATABASE_URL || '');
  return !databaseUrl.includes('localhost') && !databaseUrl.includes('127.0.0.1');
}

const pool = hasDatabase
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: shouldUseSsl() ? { rejectUnauthorized: false } : undefined,

      // Keep pool small and stable for WhatsApp webhook workloads.
      max: Number(process.env.PG_POOL_MAX || 10),
      idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
      connectionTimeoutMillis: Number(process.env.PG_CONNECTION_TIMEOUT_MS || 5000),

      // Avoid long-hanging DB queries blocking WhatsApp replies.
      query_timeout: Number(process.env.PG_QUERY_TIMEOUT_MS || 15000),
      statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS || 15000),

      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
      application_name: 'bos-whatsapp-backend',
    })
  : null;

if (pool) {
  pool.on('error', (error) => {
    console.error('PostgreSQL pool error:', {
      message: error.message,
      code: error.code || null,
    });
  });
}

async function query(text, params) {
  if (!pool) {
    throw new Error('DATABASE_URL is not configured');
  }

  return pool.query(text, params);
}

async function healthCheck() {
  if (!pool) {
    return {
      ok: false,
      error: 'DATABASE_URL is not configured',
    };
  }

  try {
    const result = await pool.query('SELECT 1 AS ok');
    return {
      ok: result.rows[0]?.ok === 1,
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      code: error.code || null,
    };
  }
}

async function closePool() {
  if (!pool) return;
  await pool.end();
}

module.exports = {
  hasDatabase,
  pool,
  query,
  healthCheck,
  closePool,
};