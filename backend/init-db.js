require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function isRemoteDatabase(databaseUrl) {
  const url = new URL(databaseUrl);
  return !['localhost', '127.0.0.1'].includes(url.hostname);
}

function clientConfig(connectionString) {
  return {
    connectionString,
    ssl: isRemoteDatabase(connectionString) ? { rejectUnauthorized: false } : undefined,
  };
}

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
  const remoteDatabase = isRemoteDatabase(process.env.DATABASE_URL);

  if (!remoteDatabase) {
    const adminUrl = new URL(process.env.DATABASE_URL);
    adminUrl.pathname = '/postgres';

    const admin = new Client(clientConfig(adminUrl.toString()));
    await admin.connect();

    if (!(await databaseExists(admin, databaseName))) {
      await admin.query(`CREATE DATABASE "${databaseName.replace(/"/g, '""')}"`);
      console.log(`Created database ${databaseName}`);
    } else {
      console.log(`Database ${databaseName} already exists`);
    }

    await admin.end();
  } else {
    console.log(`Remote database detected (${targetUrl.hostname}). Skipping CREATE DATABASE and applying schema only.`);
  }

  const appDb = new Client(clientConfig(process.env.DATABASE_URL));
  await appDb.connect();
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await appDb.query(schema);
  await appDb.end();

  console.log('Schema applied successfully');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
