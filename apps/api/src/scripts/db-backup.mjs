import 'dotenv/config'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs'
import { resolve } from 'node:path'

const rawDatabaseUrl = String(
  process.env.DIRECT_URL || process.env.DATABASE_URL || '',
).trim()

if (!rawDatabaseUrl) {
  throw new Error('DIRECT_URL or DATABASE_URL is required for backup')
}

const connection = parseDatabaseUrl(rawDatabaseUrl)
const backupDir = resolve(
  process.cwd(),
  String(process.env.DB_BACKUP_DIR || 'private/backups').trim(),
)

function parseDatabaseUrl(value) {
  let parsed

  try {
    parsed = new URL(value)
  } catch {
    throw new Error('DIRECT_URL or DATABASE_URL is not a valid PostgreSQL URL')
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('Database URL must use the postgres or postgresql protocol')
  }

  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''))
  const username = decodeURIComponent(parsed.username)

  if (!parsed.hostname || !database || !username) {
    throw new Error('Database URL must include host, database name, and username')
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

if (!existsSync(backupDir)) {
  mkdirSync(backupDir, { recursive: true })
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outputFile = resolve(backupDir, `backup-${stamp}.dump`)
const pgDumpCommand = findPostgresCommand(
  'PG_DUMP_PATH',
  'pg_dump.exe',
  'pg_dump',
)

const result = spawnSync(
  pgDumpCommand,
  [
    '--format=custom',
    '--no-owner',
    '--no-acl',
    '--schema=public',
    '--file',
    outputFile,
  ],
  {
    env: createPostgresEnvironment(connection),
    stdio: 'inherit',
    shell: false,
  },
)

if (result.error || result.status !== 0) {
  rmSync(outputFile, { force: true })

  if (result.error) {
    throw new Error(`Database backup could not start: ${result.error.message}`)
  }

  throw new Error(`Database backup failed with exit code ${result.status}`)
}

if (!existsSync(outputFile) || statSync(outputFile).size === 0) {
  rmSync(outputFile, { force: true })
  throw new Error('Database backup produced an empty file')
}

console.log(`Database backup created: ${outputFile}`)