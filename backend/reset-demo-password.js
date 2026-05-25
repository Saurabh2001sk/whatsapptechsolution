require('dotenv').config();

const bcrypt = require('bcrypt');
const { Client } = require('pg');

function shouldUseSsl(databaseUrl) {
  return !databaseUrl.includes('localhost') && !databaseUrl.includes('127.0.0.1');
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL missing in backend/.env');
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: shouldUseSsl(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : undefined,
  });

  await client.connect();

  const dbCheck = await client.query(`
    SELECT current_database() AS database_name, current_user AS db_user, inet_server_addr() AS db_host
  `);

  console.log('Connected DB:', dbCheck.rows[0]);

  const adminHash = await bcrypt.hash('admin123', 10);
  const managerHash = await bcrypt.hash('manager123', 10);
  const salesHash = await bcrypt.hash('sales123', 10);

  await client.query(`
    UPDATE tenants
    SET status = 'active',
        onboarding_status = 'pending',
        updated_at = now()
    WHERE slug = 'demo'
  `);

  const admin = await client.query(
    `
    UPDATE users
    SET password_hash = $1,
        active = true
    WHERE lower(email) = 'admin@bos.com'
    RETURNING email, role, active
    `,
    [adminHash],
  );

  const manager = await client.query(
    `
    UPDATE users
    SET password_hash = $1,
        active = true
    WHERE lower(email) = 'manager@bos.com'
    RETURNING email, role, active
    `,
    [managerHash],
  );

  const sales = await client.query(
    `
    UPDATE users
    SET password_hash = $1,
        active = true
    WHERE lower(email) = 'sales@bos.com'
    RETURNING email, role, active
    `,
    [salesHash],
  );

  console.log('Admin reset:', admin.rows);
  console.log('Manager reset:', manager.rows);
  console.log('Sales reset:', sales.rows);

  await client.end();
}

main().catch((error) => {
  console.error('Reset failed:', error.message);
  process.exit(1);
});