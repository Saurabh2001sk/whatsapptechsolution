require('dotenv').config({ path: require('path').join(__dirname, '..', 'private', 'backend.env') });

const bcrypt = require('bcrypt');
const { Client } = require('pg');

function shouldUseSsl(databaseUrl) {
  return !databaseUrl.includes('localhost') && !databaseUrl.includes('127.0.0.1');
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL missing in backend/.env');
  }

  if (process.env.CONFIRM_DEMO_PASSWORD_RESET !== 'RESET_DEMO_USERS') {
    throw new Error('Set CONFIRM_DEMO_PASSWORD_RESET=RESET_DEMO_USERS before resetting demo user passwords');
  }

  const demoPasswords = {
    admin: String(process.env.DEMO_ADMIN_PASSWORD || ''),
    manager: String(process.env.DEMO_MANAGER_PASSWORD || ''),
    sales: String(process.env.DEMO_SALES_PASSWORD || ''),
  };

  if (Object.values(demoPasswords).some((password) => password.length < 12)) {
    throw new Error('DEMO_ADMIN_PASSWORD, DEMO_MANAGER_PASSWORD and DEMO_SALES_PASSWORD must each be at least 12 characters');
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

  const tenantResult = await client.query(
    `SELECT id
     FROM tenants
     WHERE slug = 'demo'
     LIMIT 1`,
  );

  const demoTenantId = tenantResult.rows[0]?.id;

  if (!demoTenantId) {
    throw new Error('Demo tenant not found. Passwords were not reset.');
  }

  const adminHash = await bcrypt.hash(demoPasswords.admin, 10);
  const managerHash = await bcrypt.hash(demoPasswords.manager, 10);
  const salesHash = await bcrypt.hash(demoPasswords.sales, 10);

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
    WHERE tenant_id = $2
      AND lower(email) = 'admin@bos.com'
    RETURNING email, role, active
    `,
    [adminHash, demoTenantId],
  );

  const manager = await client.query(
    `
    UPDATE users
    SET password_hash = $1,
        active = true
    WHERE tenant_id = $2
      AND lower(email) = 'manager@bos.com'
    RETURNING email, role, active
    `,
    [managerHash, demoTenantId],
  );

  const sales = await client.query(
    `
    UPDATE users
    SET password_hash = $1,
        active = true
    WHERE tenant_id = $2
      AND lower(email) = 'sales@bos.com'
    RETURNING email, role, active
    `,
    [salesHash, demoTenantId],
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
