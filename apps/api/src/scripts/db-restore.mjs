import 'dotenv/config'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const databaseUrl = cleanDatabaseUrl(String(process.env.DATABASE_URL || '').trim())
const backupFileArg = String(process.argv[2] || '').trim()
const confirmed = process.argv.includes('--confirm')

function cleanDatabaseUrl(value) {
  const parsed = new URL(value)
  parsed.searchParams.delete('schema')
  return parsed.toString()
}

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for restore')
}

if (!backupFileArg || !confirmed) {
  throw new Error(
    'Usage: node src/scripts/db-restore.mjs private/backups/backup-file.dump --confirm',
  )
}

const backupFile = resolve(process.cwd(), backupFileArg)

if (!existsSync(backupFile)) {
  throw new Error(`Backup file not found: ${backupFile}`)
}

const result = spawnSync(
  'pg_restore',
  [
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-acl',
    '--dbname',
    databaseUrl,
    backupFile,
  ],
  {
    stdio: 'inherit',
    shell: false,
  },
)

if (result.status !== 0) {
  throw new Error('Database restore failed')
}

console.log('Database restore completed')