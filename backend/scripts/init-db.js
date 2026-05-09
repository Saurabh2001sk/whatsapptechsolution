require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function databaseExists(client, databaseName) {
  const result = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
  return result.rowCount > 0;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is blank in .env');
  }

  const targetUrl = new URL(process.env.DATABASE_URL);
  const databaseName = targetUrl.pathname.replace(/^\//, '');
  const adminUrl = new URL(process.env.DATABASE_URL);
  adminUrl.pathname = '/postgres';

  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();

  if (!(await databaseExists(admin, databaseName))) {
    await admin.query(`CREATE DATABASE "${databaseName.replace(/"/g, '""')}"`);
    console.log(`Created database ${databaseName}`);
  } else {
    console.log(`Database ${databaseName} already exists`);
  }

  await admin.end();

  const appDb = new Client({ connectionString: process.env.DATABASE_URL });
  await appDb.connect();
  const schema = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  await appDb.query(schema);
  await appDb.end();

  console.log('Schema applied successfully');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
