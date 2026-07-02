import 'dotenv/config'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const databaseUrl = cleanDatabaseUrl(String(process.env.DATABASE_URL || '').trim())
const backupDir = resolve(
  process.cwd(),
  String(process.env.DB_BACKUP_DIR || 'private/backups').trim(),
)

function cleanDatabaseUrl(value) {
  const parsed = new URL(value)
  parsed.searchParams.delete('schema')
  return parsed.toString()
}

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for backup')
}

if (!existsSync(backupDir)) {
  mkdirSync(backupDir, { recursive: true })
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outputFile = resolve(backupDir, `backup-${stamp}.dump`)

const result = spawnSync(
  'pg_dump',
  [
    '--format=custom',
    '--no-owner',
    '--no-acl',
    '--file',
    outputFile,
    '--dbname',
    databaseUrl,
  ],
  {
    stdio: 'inherit',
    shell: false,
  },
)

if (result.status !== 0) {
  throw new Error('Database backup failed')
}

console.log(`Database backup created: ${outputFile}`)