import 'dotenv/config'
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const rawRestoreUrl = String(process.env.RESTORE_DATABASE_URL || '').trim()
const backupFileArg = String(process.argv[2] || '').trim()
const confirmTargetArg = process.argv.find((argument) =>
  argument.startsWith('--confirm-target='),
)
const confirmedTarget = String(confirmTargetArg || '')
  .slice('--confirm-target='.length)
  .trim()
const allowProduction = process.argv.includes('--allow-production')

if (!rawRestoreUrl) {
  throw new Error(
    'RESTORE_DATABASE_URL is required; DATABASE_URL is never used automatically',
  )
}

if (!backupFileArg || backupFileArg.startsWith('--') || !confirmedTarget) {
  throw new Error(
    'Usage: node src/scripts/db-restore.mjs <backup.dump> --confirm-target=<database>',
  )
}

const target = parseDatabaseUrl(rawRestoreUrl, 'RESTORE_DATABASE_URL')

if (confirmedTarget !== target.database) {
  throw new Error(
    `Confirmation mismatch: expected --confirm-target=${target.database}`,
  )
}

const configuredProductionUrls = [
  process.env.DIRECT_URL,
  process.env.DATABASE_URL,
].filter(Boolean)

const targetsConfiguredProduction = configuredProductionUrls.some((value) =>
  safelyMatchesTarget(String(value), target),
)

const productionRestore =
  process.env.NODE_ENV === 'production' || targetsConfiguredProduction

if (productionRestore && !allowProduction) {
  throw new Error(
    'Production restore blocked; add --allow-production only during an approved recovery',
  )
}

const backupFile = resolve(process.cwd(), backupFileArg)

if (!existsSync(backupFile)) {
  throw new Error(`Backup file not found: ${backupFile}`)
}

if (statSync(backupFile).size === 0) {
  throw new Error(`Backup file is empty: ${backupFile}`)
}

function parseDatabaseUrl(value, variableName) {
  let parsed

  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`${variableName} is not a valid PostgreSQL URL`)
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error(
      `${variableName} must use the postgres or postgresql protocol`,
    )
  }

  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''))
  const username = decodeURIComponent(parsed.username)

  if (!parsed.hostname || !database || !username) {
    throw new Error(
      `${variableName} must include host, database name, and username`,
    )
  }

  return {
    host: parsed.hostname,
    port: parsed.port || '5432',
    database,
    username,
    password: decodeURIComponent(parsed.password),
    sslmode: parsed.searchParams.get('sslmode') || '',
  }
}

function safelyMatchesTarget(value, targetConnection) {
  try {
    const candidate = parseDatabaseUrl(value, 'Configured database URL')

    return (
      candidate.host.toLowerCase() === targetConnection.host.toLowerCase() &&
      candidate.port === targetConnection.port &&
      candidate.database === targetConnection.database &&
      candidate.username === targetConnection.username
    )
  } catch {
    return false
  }
}

function createPostgresEnvironment(value) {
  const environment = {
    ...process.env,
    PGHOST: value.host,
    PGPORT: value.port,
    PGDATABASE: value.database,
    PGUSER: value.username,
    PGPASSWORD: value.password,
  }

  if (value.sslmode) {
    environment.PGSSLMODE = value.sslmode
  } else {
    delete environment.PGSSLMODE
  }

  return environment
}

function findPostgresCommand(envName, executableName, fallbackCommand) {
  const configuredPath = String(process.env[envName] || '').trim()

  if (configuredPath) {
    return configuredPath
  }

  if (process.platform !== 'win32') {
    return fallbackCommand
  }

  const installationRoot = resolve(
    process.env.ProgramFiles || 'C:\\Program Files',
    'PostgreSQL',
  )

  if (existsSync(installationRoot)) {
    const versions = readdirSync(installationRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) =>
        right.localeCompare(left, undefined, { numeric: true }),
      )

    for (const version of versions) {
      const candidate = resolve(
        installationRoot,
        version,
        'bin',
        executableName,
      )

      if (existsSync(candidate)) {
        return candidate
      }
    }
  }

  return fallbackCommand
}

const pgRestoreCommand = findPostgresCommand(
  'PG_RESTORE_PATH',
  'pg_restore.exe',
  'pg_restore',
)

const postgresEnvironment = createPostgresEnvironment(target)

const validation = spawnSync(pgRestoreCommand, ['--list', backupFile], {
  env: postgresEnvironment,
  stdio: ['ignore', 'ignore', 'inherit'],
  shell: false,
})

if (validation.error) {
  throw new Error(`Backup validation could not start: ${validation.error.message}`)
}

if (validation.status !== 0) {
  throw new Error(`Backup validation failed with exit code ${validation.status}`)
}

console.log(`Restoring into ${target.host}:${target.port}/${target.database}`)

const result = spawnSync(
  pgRestoreCommand,
  [
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-acl',
    '--exit-on-error',
    '--schema=public',
    '--dbname',
    target.database,
    backupFile,
  ],
  {
    env: postgresEnvironment,
    stdio: 'inherit',
    shell: false,
  },
)

if (result.error) {
  throw new Error(`Database restore could not start: ${result.error.message}`)
}

if (result.status !== 0) {
  throw new Error(`Database restore failed with exit code ${result.status}`)
}

console.log('Database restore completed')