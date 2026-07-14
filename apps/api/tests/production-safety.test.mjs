import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

function read(path) {
return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('media production safety blocks unsafe local storage in production', () => {
const mediaService = read('../src/media/media.service.ts')

assert.match(mediaService, /MEDIA_STORAGE_DRIVER/)
assert.ok(
mediaService.includes('env.isProduction') ||
 mediaService.includes("process.env.NODE_ENV === 'production'") ||
 mediaService.includes('process.env.NODE_ENV === "production"'),
)
assert.match(mediaService, /assertMediaStorageIsProductionSafe/)
assert.match(mediaService, /Local media storage is disabled in production/)
assert.match(mediaService, /getSafeAbsolutePath/)
assert.match(mediaService, /MAX_MEDIA_FILE_SIZE_BYTES/)
})

test('media upload blocks impersonation writes', () => {
const mediaController = read('../src/media/media.controller.ts')

assert.ok(mediaController.includes('blockImpersonationWrites'))
assert.ok(mediaController.includes("'upload media'"))
})

test('billing limits are enforced for contacts, campaigns, team users, and media', () => {
const billingService = read('../src/billing/billing.service.ts')
const contactsService = read('../src/contacts/contacts.service.ts')
const campaignsService = read('../src/campaigns/campaigns.service.ts')
const mediaService = read('../src/media/media.service.ts')

assert.match(billingService, /assertCanCreateContactsInTransaction/)
assert.match(billingService, /reserveCampaignUsageInTransaction/)
assert.match(billingService, /assertCanCreateTeamUsersInTransaction/)
assert.match(billingService, /assertCanUploadMediaInTransaction/)
assert.match(billingService, /assertSubscriptionCanUseWorkspace/)
assert.match(billingService, /getEnforcementSummary/)

assert.match(contactsService, /assertCanCreateContactsInTransaction/)
assert.match(campaignsService, /reserveCampaignUsageInTransaction/)
assert.match(mediaService, /assertCanUploadMediaInTransaction/)
})

test('production readiness validates base64 encryption key format', () => {
const auditLogsService = read('../src/audit-logs/audit-logs.service.ts')
const cryptoService = read('../src/crypto/crypto.service.ts')

assert.match(cryptoService, /Buffer\.from\(env\.tokenEncryptionKey, 'base64'\)/)
assert.match(cryptoService, /TOKEN_ENCRYPTION_KEY must be 32 bytes base64/)
assert.match(auditLogsService, /isValidBase64EncryptionKey/)
assert.match(auditLogsService, /base64 encoded 32-byte key/)
})

test('campaign worker uses redacting logger', () => {
const campaignWorker = read('../src/workers/campaign-worker.ts')

assert.match(campaignWorker, /RedactingLogger/)
assert.match(campaignWorker, /app\.useLogger\(logger\)/)
})

test('platform admin promotion script requires confirmation and audit log', () => {
const promotionScript = read('../src/scripts/promote-platform-admin.ts')

assert.match(promotionScript, /--confirm/)
assert.match(promotionScript, /PLATFORM_ADMIN_PROMOTED_BY_SCRIPT/)
assert.match(promotionScript, /sessionVersion/)
})

test('billing and media controllers use centralized request auth', () => {
const billingController = read('../src/billing/billing.controller.ts')
const mediaController = read('../src/media/media.controller.ts')

assert.doesNotMatch(
  billingController,
  /validateSession\(\s*request\.cookies\?\.access_token/,
)
assert.doesNotMatch(
  mediaController,
  /validateSession\(\s*request\.cookies\?\.access_token/,
)

assert.match(billingController, /requireUserFromRequest\(request\)/)
assert.match(mediaController, /requireUserFromRequest\(request\)/)
})

test('sensitive admin routes remain role protected', () => {
const billingController = read('../src/billing/billing.controller.ts')
const platformAdminController = read('../src/platform-admin/platform-admin.controller.ts')
const tenantsController = read('../src/tenants/tenants.controller.ts')
const auditLogsController = read('../src/audit-logs/audit-logs.controller.ts')
const metaAccountsController = read('../src/meta-accounts/meta-accounts.controller.ts')

assert.match(billingController, /requireRole\(user, platformAdminRoles\)/)
assert.match(platformAdminController, /requireRole\(user, \['platform_admin', 'super_admin'\]\)/)
assert.match(tenantsController, /requireRole\(user, \['platform_admin', 'super_admin'\]\)/)
assert.match(auditLogsController, /requireRole\(user, auditViewerRoles\)/)
assert.match(metaAccountsController, /requireRole\(user, webhookViewerRoles\)/)
})

test('high privilege sessions require confirmed 2fa for impersonation', () => {
const authService = read('../src/auth/auth.service.ts')
const platformAdminService = read('../src/platform-admin/platform-admin.service.ts')

assert.match(authService, /actorUser\.twoFactorEnabled/)
assert.match(authService, /actorUser\.twoFactorConfirmedAt/)
assert.match(platformAdminService, /twoFactorEnabled/)
assert.match(platformAdminService, /twoFactorConfirmedAt/)
})

test('ci runs api tests and web build checks', () => {
const ci = read('../../../.github/workflows/ci.yml')

assert.match(ci, /npm run build/)
assert.match(ci, /npm run test/)
assert.match(ci, /npm run lint/)
assert.match(ci, /npm audit --audit-level=high/)
assert.match(ci, /TOKEN_ENCRYPTION_KEY: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=/)
})

test('production media supports s3-compatible storage', () => {
const mediaService = read('../src/media/media.service.ts')
const mediaController = read('../src/media/media.controller.ts')
const envFile = read('../src/config/env.ts')

assert.match(mediaService, /@aws-sdk\/client-s3/)
assert.match(mediaService, /PutObjectCommand/)
assert.match(mediaService, /GetObjectCommand/)
assert.match(mediaService, /DeleteObjectCommand/)
assert.match(mediaService, /MEDIA_STORAGE_DRIVER === 's3'/)
assert.match(mediaService, /ServerSideEncryption: 'AES256'/)
assert.match(mediaController, /response\.send\(media\.buffer\)/)
assert.match(envFile, /s3Bucket/)
assert.match(envFile, /s3AccessKeyId/)
})

test('sentry monitoring is wired without sending secrets', () => {
const main = read('../src/main.ts')
const sentryFilter = read('../src/security/sentry.filter.ts')
const appModule = read('../src/app.module.ts')

assert.match(main, /@sentry\/node/)
assert.match(main, /Sentry\.init/)
assert.match(main, /Sentry\.captureException/)
assert.match(sentryFilter, /SentryExceptionFilter/)
assert.match(sentryFilter, /status >= 500/)
assert.doesNotMatch(sentryFilter, /request\.headers/)
assert.doesNotMatch(sentryFilter, /request\.cookies/)
assert.doesNotMatch(sentryFilter, /request\.body/)
assert.match(appModule, /APP_FILTER/)
})

test('database backup and restore scripts exist with restore confirmation', () => {
const packageJson = JSON.parse(read('../package.json'))
const backupScript = read('../src/scripts/db-backup.mjs')
const restoreScript = read('../src/scripts/db-restore.mjs')
const gitignore = read('../../../.gitignore')

assert.equal(packageJson.scripts['db:backup'], 'node src/scripts/db-backup.mjs')
assert.equal(packageJson.scripts['db:restore'], 'node src/scripts/db-restore.mjs')
assert.match(backupScript, /pg_dump/)
assert.match(restoreScript, /pg_restore/)
assert.match(restoreScript, /--confirm/)
assert.match(gitignore, /\*\.dump/)
})

test('api package exposes automated test command', () => {
const packageJson = JSON.parse(read('../package.json'))

assert.equal(packageJson.scripts.test, 'node --test tests/*.test.mjs')
})

test('campaign delivery summary uses recipient timestamps', () => {
  const campaignsService = read('../src/campaigns/campaigns.service.ts')

  const methodStart = campaignsService.indexOf(
    'async getCampaignFailureSummary',
  )
  const methodEnd = campaignsService.indexOf(
    'async exportCampaignFailuresCsv',
  )

  assert.ok(methodStart >= 0)
  assert.ok(methodEnd > methodStart)

  const summaryMethod = campaignsService.slice(methodStart, methodEnd)

  assert.doesNotMatch(summaryMethod, /deliveredCount:\s*true/)
  assert.doesNotMatch(summaryMethod, /readCount:\s*true/)
  assert.match(summaryMethod, /deliveredAt:\s*\{\s*not:\s*null/)
  assert.match(summaryMethod, /readAt:\s*\{\s*not:\s*null/)
  assert.match(summaryMethod, /\.\.\.campaign/)
  assert.match(summaryMethod, /deliveredCount/)
  assert.match(summaryMethod, /readCount/)
})

test('Meta phone ownership is globally unique and transaction protected', () => {
  const schema = read('../prisma/schema.prisma')
  const metaAccountsService = read(
    '../src/meta-accounts/meta-accounts.service.ts',
  )

  assert.match(schema, /phoneNumberId\s+String\s+@unique/)
  assert.doesNotMatch(
    schema,
    /@@unique\(\[tenantId,\s*phoneNumberId\]\)/,
  )

  assert.match(metaAccountsService, /saveConnectedMetaAccount/)
  assert.match(metaAccountsService, /\$transaction/)
  assert.match(metaAccountsService, /P2002/)
  assert.match(
    metaAccountsService,
    /tenantMetaAccount\.findUnique/,
  )
  assert.match(
    metaAccountsService,
    /account\?\.isActive\s*\?\s*account\.tenantId\s*:\s*null/,
  )
})