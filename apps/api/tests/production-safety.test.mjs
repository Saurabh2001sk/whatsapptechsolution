import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

function read(path) {
return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('media production safety blocks unsafe local storage in production', () => {
const mediaService = read('../src/services/media.service.ts')

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
const mediaController = read('../src/controller/media.controller.ts')

assert.ok(mediaController.includes('blockImpersonationWrites'))
assert.ok(mediaController.includes("'upload media'"))
})

test('billing limits are enforced for contacts, campaigns, team users, and media', () => {
const billingService = read('../src/services/billing.service.ts')
const contactsService = read('../src/services/contacts.service.ts')
const campaignsService = read('../src/services/campaigns.service.ts')
const mediaService = read('../src/services/media.service.ts')

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
const auditLogsService = read('../src/services/audit-logs.service.ts')
const cryptoService = read('../src/services/crypto.service.ts')

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
const billingController = read('../src/controller/billing.controller.ts')
const mediaController = read('../src/controller/media.controller.ts')

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
const billingController = read('../src/controller/billing.controller.ts')
const platformAdminController = read('../src/controller/platform-admin.controller.ts')
const tenantsController = read('../src/controller/tenants.controller.ts')
const auditLogsController = read('../src/controller/audit-logs.controller.ts')
const metaAccountsController = read('../src/controller/meta-accounts.controller.ts')

assert.match(billingController, /requireRole\(user, platformAdminRoles\)/)
assert.match(platformAdminController, /requireRole\(user, \['platform_admin', 'super_admin'\]\)/)
assert.match(tenantsController, /requireRole\(user, \['platform_admin', 'super_admin'\]\)/)
assert.match(auditLogsController, /requireRole\(user, auditViewerRoles\)/)
assert.match(metaAccountsController, /requireRole\(user, webhookViewerRoles\)/)
})

test('high privilege sessions require confirmed 2fa for impersonation', () => {
const authService = read('../src/services/auth.service.ts')
const platformAdminService = read('../src/services/platform-admin.service.ts')

assert.match(authService, /actorUser\.twoFactorEnabled/)
assert.match(authService, /actorUser\.twoFactorConfirmedAt/)
assert.match(platformAdminService, /twoFactorEnabled/)
assert.match(platformAdminService, /twoFactorConfirmedAt/)
})

test('team user deactivation is transaction safe and revokes sessions', () => {
  const teamUsersService = read(
    '../src/services/team-users.service.ts',
  )

  assert.match(
    teamUsersService,
    /pg_advisory_xact_lock/,
  )

  assert.match(
    teamUsersService,
    /team-user-deactivate:\$\{tenantId\}/,
  )

  assert.match(
    teamUsersService,
    /Prisma\.TransactionIsolationLevel\.Serializable/,
  )

  assert.match(
    teamUsersService,
    /Tenant must keep at least one active admin/,
  )

  assert.match(
    teamUsersService,
    /sessionVersion:\s*\{\s*increment:\s*1/,
  )

  assert.match(
    teamUsersService,
    /trustedDevice\.updateMany/,
  )

  assert.match(
    teamUsersService,
    /twoFactorLoginChallenge\.deleteMany/,
  )

  assert.match(
    teamUsersService,
    /Password is too common/,
  )
})

test('team user routes remain tenant isolated and block impersonation', () => {
  const controller = read(
    '../src/controller/team-users.controller.ts',
  )

  assert.match(
    controller,
    /requireUserFromRequest\(request\)/,
  )

  assert.match(
    controller,
    /requireRole\(user,\s*\['admin'\]\)/,
  )

  assert.match(
    controller,
    /user\.tenantId/,
  )

  assert.match(
    controller,
    /user\.impersonating/,
  )

  assert.doesNotMatch(
    controller,
    /body\.tenantId/,
  )

  assert.doesNotMatch(
    controller,
    /query\.tenantId/,
  )
})


test('ci runs api tests and web build checks', () => {
const ci = read('../../../.github/workflows/ci.yml')

assert.match(ci, /npm run build/)
assert.match(ci, /npm run test/)
assert.match(ci, /npm run lint/)
assert.match(ci, /DIRECT_URL:/)
assert.match(ci, /npm audit --audit-level=high/)
assert.match(ci, /TOKEN_ENCRYPTION_KEY: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=/)
})

test('production media supports s3-compatible storage', () => {
const mediaService = read('../src/services/media.service.ts')
const mediaController = read('../src/controller/media.controller.ts')
const envFile = read('../src/env.ts')

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
  const appModule = read('../src/modules/app.module.ts')

  assert.match(main, /@sentry\/node/)
  assert.match(main, /Sentry\.init/)
  assert.match(main, /Sentry\.captureException/)
  assert.match(sentryFilter, /SentryExceptionFilter/)
  assert.match(sentryFilter, /status >= 500/)
  assert.match(sentryFilter, /queryKeys/)
  assert.match(sentryFilter, /Object\.keys\(request\.query/)
  assert.doesNotMatch(sentryFilter, /query:\s*request\.query/)
  assert.doesNotMatch(sentryFilter, /request\.headers/)
  assert.doesNotMatch(sentryFilter, /request\.cookies/)
  assert.doesNotMatch(sentryFilter, /request\.body/)
  assert.match(appModule, /APP_FILTER/)
})

test('redis rate limiter increments and expires atomically', () => {
  const rateLimiter = read(
    '../src/services/security-rate-limit.service.ts',
  )

  assert.match(rateLimiter, /atomicRateLimitScript/)
  assert.match(rateLimiter, /redis\.call\('INCR'/)
  assert.match(rateLimiter, /redis\.call\('PEXPIRE'/)
  assert.match(rateLimiter, /this\.redis\.eval/)
  assert.doesNotMatch(
    rateLimiter,
    /const count = await this\.redis\.incr/,
  )
})

test('services use centralized environment configuration', () => {
  const envFile = read('../src/env.ts')
  const authService = read('../src/services/auth.service.ts')
  const twoFactorService = read(
    '../src/services/two-factor.service.ts',
  )
  const templatesService = read(
    '../src/services/templates.service.ts',
  )

  assert.match(envFile, /twoFactorIssuer/)
  assert.match(authService, /env\.frontendUrl/)
  assert.match(twoFactorService, /env\.twoFactorIssuer/)
  assert.match(
    templatesService,
    /env\.metaGraphApiVersion/,
  )

  assert.doesNotMatch(
    authService,
    /process\.env\.FRONTEND_URL/,
  )
  assert.doesNotMatch(
    twoFactorService,
    /process\.env\.TWO_FACTOR_ISSUER/,
  )
  assert.doesNotMatch(
    templatesService,
    /process\.env\.META_GRAPH_API_VERSION/,
  )
})

test('notification recipients are deduplicated case-insensitively', () => {
  const service = read(
    '../src/services/notifications.service.ts',
  )

  assert.match(
    service,
    /getUniqueRecipients/,
  )

  assert.match(
    service,
    /\.toLowerCase\(\)/,
  )

  assert.match(
    service,
    /new Map<string,\s*string>/,
  )

  assert.match(
    service,
    /\.\.\.users\.map\(\(user\) => user\.email\)/,
  )

  assert.match(
    service,
    /fallbackEmail/,
  )
})

test('notification provider calls have bounded timeouts', () => {
  const service = read(
    '../src/services/notifications.service.ts',
  )

  assert.match(
    service,
    /connectionTimeout:\s*10_000/,
  )

  assert.match(
    service,
    /greetingTimeout:\s*10_000/,
  )

  assert.match(
    service,
    /socketTimeout:\s*15_000/,
  )

  assert.match(
    service,
    /AbortSignal\.timeout\(15_000\)/,
  )
})

test('notification errors redact secrets and bound stored content', () => {
  const service = read(
    '../src/services/notifications.service.ts',
  )

  assert.match(
    service,
    /sanitizeNotificationError/,
  )

  assert.match(
    service,
    /Bearer \[REDACTED\]/,
  )

  assert.match(
    service,
    /api-key/,
  )

  assert.match(
    service,
    /smtp/,
  )

  assert.match(
    service,
    /\.slice\(0,\s*1000\)/,
  )

  assert.doesNotMatch(
    service,
    /responseText\.slice\(0,\s*500\)/,
  )
})

test('notification content is bounded and subject header safe', () => {
  const service = read(
    '../src/services/notifications.service.ts',
  )

  assert.match(
    service,
    /\.replace\(\/\[\\r\\n\]\+\/g,\s*' '\)/,
  )

  assert.match(
    service,
    /\.slice\(0,\s*200\)/,
  )

  assert.match(
    service,
    /\.slice\(0,\s*10_000\)/,
  )
})

test('billing plan requests are tenant locked and allow only one pending request', () => {
  const service = read(
    '../src/services/billing.service.ts',
  )

  const methodStart = service.indexOf(
    'async requestPlanChange',
  )

  const methodEnd = service.indexOf(
    'private async createTrialSubscription',
  )

  assert.ok(methodStart >= 0)
  assert.ok(methodEnd > methodStart)

  const method = service.slice(
    methodStart,
    methodEnd,
  )

  assert.match(
    method,
    /billing-plan-request:\$\{tenantId\}/,
  )

  assert.match(
    method,
    /pg_advisory_xact_lock/,
  )

  assert.match(
    method,
    /status:\s*'PENDING_APPROVAL'/,
  )

  assert.match(
    method,
    /Prisma\.TransactionIsolationLevel\.Serializable/,
  )

  assert.match(
    method,
    /created:\s*false as const/,
  )
})

test('payment proof submission is subscription locked and duplicate safe', () => {
  const service = read(
    '../src/services/billing.service.ts',
  )

  const methodStart = service.indexOf(
    'async submitPaymentProof',
  )

  const methodEnd = service.indexOf(
    'async approveSubscription',
  )

  assert.ok(methodStart >= 0)
  assert.ok(methodEnd > methodStart)

  const method = service.slice(
    methodStart,
    methodEnd,
  )

  assert.match(
    method,
    /billing-subscription:\$\{subscriptionId\}/,
  )

  assert.match(
    method,
    /pg_advisory_xact_lock/,
  )

  assert.match(
    method,
    /sameProofAlreadySubmitted/,
  )

  assert.match(
    method,
    /status !==\s*'PENDING_APPROVAL'/,
  )

  assert.match(
    method,
    /Prisma\.TransactionIsolationLevel\.Serializable/,
  )
})

test('billing approve and cancel share one subscription lock', () => {
  const service = read(
    '../src/services/billing.service.ts',
  )

  const approveStart = service.indexOf(
    'async approveSubscription',
  )

  const cancelStart = service.indexOf(
    'async cancelSubscription',
  )

  const usageStart = service.indexOf(
    'async getUsageSummary',
  )

  assert.ok(approveStart >= 0)
  assert.ok(cancelStart > approveStart)
  assert.ok(usageStart > cancelStart)

  const approveMethod = service.slice(
    approveStart,
    cancelStart,
  )

  const cancelMethod = service.slice(
    cancelStart,
    usageStart,
  )

  assert.match(
    approveMethod,
    /billing-subscription:\$\{subscriptionId\}/,
  )

  assert.match(
    cancelMethod,
    /billing-subscription:\$\{subscriptionId\}/,
  )

  assert.match(
    cancelMethod,
    /status !==\s*'PENDING_APPROVAL'/,
  )

  assert.match(
    cancelMethod,
    /Prisma\.TransactionIsolationLevel\.Serializable/,
  )
})

test('billing approval is transaction locked against duplicate approval', () => {
  const billingService = read(
    '../src/services/billing.service.ts',
  )

  const methodStart = billingService.indexOf(
    'async approveSubscription',
  )
  const methodEnd = billingService.indexOf(
    'async cancelSubscription',
  )

  assert.ok(methodStart >= 0)
  assert.ok(methodEnd > methodStart)

  const approvalMethod = billingService.slice(
    methodStart,
    methodEnd,
  )

  assert.match(
    approvalMethod,
    /pg_advisory_xact_lock/,
  )

assert.match(
  approvalMethod,
  /billing-subscription:\$\{subscriptionId\}/,
)

  assert.match(
    approvalMethod,
    /Prisma\.TransactionIsolationLevel\.Serializable/,
  )

  assert.match(
    approvalMethod,
    /status !== 'PENDING_APPROVAL'/,
  )

  assert.match(
    approvalMethod,
    /paymentProofStatus !==\s*'PENDING_VERIFICATION'/,
  )
})

test('webhook campaign counts include processing recipients', () => {
  const metaAccountsService = read(
    '../src/services/meta-accounts.service.ts',
  )

  const methodStart = metaAccountsService.indexOf(
    'private async recalculateCampaignCounts',
  )
  const methodEnd = metaAccountsService.indexOf(
    'private parseWebhookTimestamp',
  )

  assert.ok(methodStart >= 0)
  assert.ok(methodEnd > methodStart)

  const countMethod = metaAccountsService.slice(
    methodStart,
    methodEnd,
  )

  assert.match(
    countMethod,
    /in:\s*\['PENDING',\s*'PROCESSING'\]/,
  )
})

test('Meta account management routes require admin role', () => {
  const controller = read(
    '../src/controller/meta-accounts.controller.ts',
  )

  assert.match(
    controller,
    /const metaAccountManagerRoles = \[/,
  )

  assert.match(
    controller,
    /requireRole\(user, metaAccountManagerRoles\)/,
  )

  const roleChecks =
    controller.match(
      /requireRole\(user, metaAccountManagerRoles\)/g,
    ) || []

  assert.ok(roleChecks.length >= 5)

  assert.match(
    controller,
    /blockImpersonationWrites/,
  )
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

test('campaign queue preserves existing live deterministic jobs', () => {
  const queue = read(
    '../src/Queues/campaigns.queue.ts',
  )

  assert.match(
    queue,
    /campaign-\$\{campaignId\}/,
  )

  assert.match(
    queue,
    /'active'/,
  )

  assert.match(
    queue,
    /'waiting'/,
  )

  assert.match(
    queue,
    /'delayed'/,
  )

  assert.match(
    queue,
    /reusableStates\.has\(state\)/,
  )

  assert.match(
    queue,
    /return existingJob/,
  )
})

test('campaign recovery does not overlap in one worker process', () => {
  const processor = read(
    '../src/Processor/campaigns.processor.ts',
  )

  assert.match(
    processor,
    /private recoveryInProgress = false/,
  )

  assert.match(
    processor,
    /if \(this\.recoveryInProgress\)/,
  )

  assert.match(
    processor,
    /this\.recoveryInProgress = true/,
  )

  assert.match(
    processor,
    /finally/,
  )

  assert.match(
    processor,
    /this\.recoveryInProgress = false/,
  )
})

test('stale processing campaign recipients are quarantined without automatic resend', () => {
  const campaignsService = read(
    '../src/services/campaigns.service.ts',
  )

  const methodStart = campaignsService.indexOf(
    'async enqueueDueAndStuckCampaigns',
  )

  const methodEnd = campaignsService.indexOf(
    'async processCampaignSendJob',
  )

  assert.ok(methodStart >= 0)
  assert.ok(methodEnd > methodStart)

  const recoveryMethod = campaignsService.slice(
    methodStart,
    methodEnd,
  )

  assert.match(
    recoveryMethod,
    /status:\s*'PROCESSING'/,
  )

  assert.match(
    recoveryMethod,
    /15 \* 60 \* 1000/,
  )

  assert.match(
    recoveryMethod,
    /Delivery state is uncertain after worker interruption/,
  )

  assert.match(
    recoveryMethod,
    /Automatic retry was blocked to prevent a duplicate WhatsApp message/,
  )

  assert.match(
    recoveryMethod,
    /CAMPAIGN_STALE_PROCESSING_QUARANTINED/,
  )

  assert.match(
    recoveryMethod,
    /quarantinedProcessing/,
  )

  assert.doesNotMatch(
    recoveryMethod,
    /status:\s*'PENDING',\s*errorMessage:\s*'Delivery state is uncertain/,
  )
})

test('campaign delivery summary uses recipient timestamps', () => {
  const campaignsService = read('../src/services/campaigns.service.ts')

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

test('webhook replay routes use Redis-backed bounded rate limits', () => {
  const controller = read(
    '../src/controller/meta-accounts.controller.ts',
  )

  const module = read(
    '../src/modules/meta-accounts.module.ts',
  )

  assert.match(
    module,
    /SecurityModule/,
  )

  assert.match(
    controller,
    /SecurityRateLimitService/,
  )

  assert.match(
    controller,
    /consumeWebhookReplayLimit/,
  )

  assert.match(
    controller,
    /meta_webhook_replay_user/,
  )

  assert.match(
    controller,
    /meta_webhook_replay_event/,
  )

  assert.match(
    controller,
    /meta_webhook_replay_ip/,
  )

  assert.match(
    controller,
    /limit:\s*10/,
  )

  assert.match(
    controller,
    /limit:\s*3/,
  )
})

test('webhook replay is tenant locked and transaction safe', () => {
  const service = read(
    '../src/services/meta-accounts.service.ts',
  )

  const methodStart = service.indexOf(
    'async replayWebhookEvent',
  )

  const methodEnd = service.indexOf(
    'private async processWebhookBody',
  )

  assert.ok(methodStart >= 0)
  assert.ok(methodEnd > methodStart)

  const replayMethod = service.slice(
    methodStart,
    methodEnd,
  )

  assert.match(
    replayMethod,
    /pg_advisory_xact_lock/,
  )

  assert.match(
    replayMethod,
    /meta-webhook-replay:\$\{tenantId\}:\$\{id\}/,
  )

  assert.match(
    replayMethod,
    /id,\s*tenantId/,
  )

  assert.match(
    replayMethod,
    /Prisma\.TransactionIsolationLevel\.Serializable/,
  )

  assert.match(
    replayMethod,
    /timeout:\s*30_000/,
  )
})

test('webhook processing bounds events and redacts stored errors', () => {
  const service = read(
    '../src/services/meta-accounts.service.ts',
  )

  assert.match(
    service,
    /sanitizeWebhookError/,
  )

  assert.match(
    service,
    /Bearer \[REDACTED\]/,
  )

  assert.match(
    service,
    /access_token/,
  )

  assert.match(
    service,
    /client_secret/,
  )

  assert.match(
    service,
    /\.slice\(0,\s*1000\)/,
  )

  assert.match(
    service,
    /totalEvents > 500/,
  )

  assert.match(
    service,
    /Meta webhook payload contains too many events/,
  )
})

test('Meta phone ownership is globally unique and transaction protected', () => {
  const schema = read('../prisma/schema.prisma')
  const metaAccountsService = read(
    '../src/services/meta-accounts.service.ts',
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

test('Embedded Signup automatically subscribes WABA to platform webhooks', () => {
  const metaAccountsService = read(
    '../src/services/meta-accounts.service.ts',
  )
  const metaAccountsController = read(
    '../src/controller/meta-accounts.controller.ts',
  )

  assert.match(
    metaAccountsService,
    /subscribeAppToWaba/,
  )

  assert.match(
    metaAccountsService,
    /\/subscribed_apps/,
  )

  assert.match(
    metaAccountsService,
    /method:\s*'POST'/,
  )

  assert.match(
    metaAccountsService,
    /Authorization:\s*`Bearer \$\{input\.accessToken\}`/,
  )

  assert.match(
    metaAccountsService,
    /syncActiveWebhookSubscription/,
  )

  assert.match(
    metaAccountsController,
    /sync-webhook-subscription/,
  )

  assert.match(
    metaAccountsController,
    /blockImpersonationWrites/,
  )
})

test('drip schema preserves re-entry history and media cache fields', () => {
  const schema = read('../prisma/schema.prisma')

  assert.match(
    schema,
    /enrollmentCycle\s+Int\s+@default\(1\)/,
  )

  assert.match(
    schema,
    /@@unique\(\[workflowId,\s*contactId,\s*enrollmentCycle\]\)/,
  )

  assert.doesNotMatch(
    schema,
    /@@unique\(\[workflowId,\s*contactId\]\)/,
  )

  assert.match(
    schema,
    /metaHeaderMediaId\s+String\?/,
  )

  assert.match(
    schema,
    /metaHeaderMediaUploadedAt\s+DateTime\?/,
  )

  assert.match(
    schema,
    /archivedAt\s+DateTime\?/,
  )

  assert.match(
    schema,
    /@@index\(\[tenantId,\s*workflowId,\s*contactId,\s*status\]\)/,
  )
})

test('drip workflow creation enforces tenant plan automation limit', () => {
  const billingService = read(
    '../src/services/billing.service.ts',
  )

  const dripsService = read(
    '../src/services/drips.service.ts',
  )

  assert.match(
    billingService,
    /assertCanCreateAutomationInTransaction/,
  )

  assert.match(
    billingService,
    /maxAutomationRules/,
  )

  assert.match(
    billingService,
    /status:\s*\{\s*not:\s*'ARCHIVED'/,
  )

  assert.match(
    dripsService,
    /assertCanCreateAutomationInTransaction\(/,
  )

  assert.match(
    dripsService,
    /Prisma\.TransactionIsolationLevel\.Serializable/,
  )
})

test('drip routes use authenticated tenant and protected roles', () => {
  const controller = read(
    '../src/controller/drips.controller.ts',
  )

  assert.match(
    controller,
    /requireUserFromRequest\(request\)/,
  )

  assert.match(
    controller,
    /const dripEditorRoles = \['admin', 'manager', 'platform_admin', 'super_admin'\]/,
  )

  assert.match(
    controller,
    /const dripEnrollmentRoles = \['admin', 'manager', 'agent', 'platform_admin', 'super_admin'\]/,
  )

  assert.match(
    controller,
    /requireRole\(user, dripEditorRoles\)/,
  )

  assert.match(
    controller,
    /requireRole\(user, dripEnrollmentRoles\)/,
  )

  assert.match(
    controller,
    /blockImpersonationWrites/,
  )

  assert.match(
    controller,
    /user\.tenantId/,
  )

  assert.doesNotMatch(
    controller,
    /body\.tenantId/,
  )

  assert.doesNotMatch(
    controller,
    /query\.tenantId/,
  )
})

test('drip routes use rate limits and bounded read controls', () => {
  const controller = read(
    '../src/controller/drips.controller.ts',
  )

  const module = read(
    '../src/modules/drips.module.ts',
  )

  const service = read(
    '../src/services/drips.service.ts',
  )

  assert.match(
    module,
    /SecurityModule/,
  )

  assert.match(
    controller,
    /SecurityRateLimitService/,
  )

  assert.match(
    controller,
    /consumeWriteLimit/,
  )

  assert.match(
    controller,
    /drips_\$\{action\}_user/,
  )

  assert.match(
    controller,
    /@Query\('limit'\)/,
  )

  assert.match(
    controller,
    /@Get\(':id\/summary'\)/,
  )

  assert.match(
    service,
    /cleanBoundedInteger/,
  )

  assert.match(
    service,
    /getWorkflowSummary/,
  )
})

test('drip workflow activation enrolls existing contacts in background batches', () => {
  const service = read(
    '../src/services/drips.service.ts',
  )

  const queue = read(
    '../src/Queues/drips.queue.ts',
  )

  const processor = read(
    '../src/Processor/drips.processor.ts',
  )

  const dripsPage = read(
    '../../web/src/pages/DripsPage.tsx',
  )

  assert.match(
    service,
    /EXISTING_CONTACTS_ENROLLMENT_BATCH_SIZE\s*=\s*1000/,
  )

  assert.match(
    service,
    /EXISTING_CONTACTS_NEXT_BATCH_DELAY_MS\s*=\s*2000/,
  )

  assert.match(
    service,
    /addExistingContactsEnrollmentBatchJob/,
  )

  assert.match(
    service,
    /async processExistingContactsEnrollmentBatch/,
  )

  assert.match(
    service,
    /DRIP_EXISTING_CONTACT_BATCH_ENROLLED/,
  )

  assert.match(
    service,
    /DRIP_EXISTING_CONTACT_ENROLLMENT_COMPLETED/,
  )

  assert.match(
    service,
    /tenantId:\s*input\.tenantId,\s*workflowId:\s*workflow\.id/,
  )

  const activationMethodStart = service.indexOf(
    'async activateWorkflow',
  )

  const activationMethodEnd = service.indexOf(
    'async processExistingContactsEnrollmentBatch',
  )

  assert.ok(activationMethodStart >= 0)
  assert.ok(activationMethodEnd > activationMethodStart)

  const activationMethod = service.slice(
    activationMethodStart,
    activationMethodEnd,
  )

  assert.match(
    activationMethod,
    /addExistingContactsEnrollmentBatchJob/,
  )

  assert.doesNotMatch(
    activationMethod,
    /contact\.findMany/,
  )

  assert.match(
    queue,
    /DripExistingContactsEnrollmentJobData/,
  )

  assert.match(
    queue,
    /DRIP_EXISTING_CONTACT_ENROLLMENT_QUEUE/,
  )

  assert.match(
    queue,
    /addExistingContactsEnrollmentBatchJob/,
  )

  assert.match(
    processor,
    /processExistingContactsEnrollmentBatch/,
  )

  assert.match(
    processor,
    /concurrency:\s*1/,
  )

  assert.match(
    dripsPage,
    /Existing contacts are being enrolled in background batches/,
  )
})

test('drip enrolment requires consent and tenant ownership', () => {
  const dripsService = read(
    '../src/services/drips.service.ts',
  )

  assert.match(
    dripsService,
    /tenantId,\s*deletedAt:\s*null,\s*optedIn:\s*true/,
  )

  assert.match(
    dripsService,
    /optInSource:\s*\{\s*not:\s*null/,
  )

assert.match(
  dripsService,
  /workflow\.audienceType === 'CONTACT_TYPE'/,
)

assert.match(
  dripsService,
  /contactTypeId:\s*workflow\.targetContactTypeId/,
)

  assert.match(
    dripsService,
    /pg_advisory_xact_lock/,
  )

  assert.match(
    dripsService,
    /hashtextextended/,
  )

  assert.match(
    dripsService,
    /enrollmentCycle:\s*'desc'/,
  )

  assert.match(
    dripsService,
    /workflow\.allowReentry/,
  )

  assert.match(
    dripsService,
    /reentryCooldownDays/,
  )
})

test('drip scheduling enforces timezone days and sending window', () => {
  const dripsService = read(
    '../src/services/drips.service.ts',
  )

  const dripsPage = read(
    '../../web/src/pages/DripsPage.tsx',
  )

  assert.match(
    dripsService,
    /calculateAllowedRunAt/,
  )

  assert.match(
    dripsService,
    /const FIXED_DRIP_TIMEZONE = 'Asia\/Kolkata'/,
  )

  assert.match(
    dripsService,
    /const timezone = FIXED_DRIP_TIMEZONE/,
  )

  assert.match(
    dripsPage,
    /const FIXED_DRIP_TIMEZONE = 'Asia\/Kolkata'/,
  )

  assert.match(
    dripsPage,
    /timezone: FIXED_DRIP_TIMEZONE/,
  )

  assert.match(
    dripsService,
    /isInsideAllowedSendingWindow/,
  )

  assert.match(
    dripsService,
    /Intl\.DateTimeFormat/,
  )

  assert.match(
    dripsService,
    /timeZone:\s*timezone/,
  )

  assert.match(
    dripsService,
    /sendingWindowWeekday/,
  )

  assert.match(
    dripsService,
    /overnightWindow/,
  )

  assert.match(
    dripsService,
    /Message moved to the next allowed workflow sending window/,
  )
})

test('drip sending uses official Meta API and protected media', () => {
  const dripsService = read(
    '../src/services/drips.service.ts',
  )

  assert.match(
    dripsService,
    /getActiveConnectionSecret/,
  )

  assert.match(
    dripsService,
    /getMediaForMetaUpload/,
  )

  assert.match(
    dripsService,
    /graph\.facebook\.com/,
  )

  assert.match(
    dripsService,
    /\/media`/,
  )

  assert.match(
    dripsService,
    /\/messages`/,
  )

  assert.match(
    dripsService,
    /messaging_product:\s*'whatsapp'/,
  )

  assert.match(
    dripsService,
    /type:\s*'template'/,
  )

  assert.match(
    dripsService,
    /metaHeaderMediaUploadedAt/,
  )

  assert.doesNotMatch(
    dripsService,
    /whatsapp-web\.js/,
  )

  assert.doesNotMatch(
    dripsService,
    /Baileys/,
  )

  assert.doesNotMatch(
    dripsService,
    /qr code/i,
  )
})

test('drip retries classify temporary errors and redact secrets', () => {
  const service = read(
    '../src/services/drips.service.ts',
  )

  const processor = read(
    '../src/Processor/drips.processor.ts',
  )

  assert.match(
    service,
    /isRetryableMetaFailure/,
  )

  assert.match(
    service,
    /isRetryableDripError/,
  )

  assert.match(
    service,
    /sanitizeDripErrorMessage/,
  )

  assert.match(
    service,
    /Bearer \[REDACTED\]/,
  )

  assert.match(
    service,
    /access_token=\[REDACTED\]/,
  )

  assert.match(
    processor,
    /attemptsRemain/,
  )

  assert.match(
    processor,
    /isRetryableDripError/,
  )
})

test('drip webhook delivery updates remain tenant isolated', () => {
  const metaAccountsService = read(
    '../src/services/meta-accounts.service.ts',
  )

  assert.match(
    metaAccountsService,
    /syncDripMessageDeliveryStatus/,
  )

  assert.match(
    metaAccountsService,
    /tenantId:\s*input\.tenantId,\s*metaMessageId:\s*input\.messageId/,
  )

  assert.match(
    metaAccountsService,
    /Ignored drip delivery status downgrade/,
  )

  assert.match(
    metaAccountsService,
    /Ignored failed status after message was read/,
  )

  assert.match(
    metaAccountsService,
    /DRIP_MESSAGE_\$\{input\.status\}/,
  )
})

test('inbound drip automation never creates consent', () => {
  const metaAccountsService = read(
    '../src/services/meta-accounts.service.ts',
  )

  const dripsService = read(
    '../src/services/drips.service.ts',
  )

  assert.match(
    metaAccountsService,
    /extractInboundMessages/,
  )

  assert.match(
    metaAccountsService,
    /autoEnrollInboundContact/,
  )

  assert.match(
    dripsService,
    /Inbound sender is not an existing opted-in contact/,
  )

  assert.match(
    dripsService,
    /INBOUND:\$\{metaMessageId\}/,
  )

  assert.match(
    dripsService,
    /sourceAlreadyProcessed/,
  )

  const inboundMethodStart = dripsService.indexOf(
    'async autoEnrollInboundContact',
  )

  const inboundMethodEnd = dripsService.indexOf(
    'async stopContactDripEnrollments',
  )

  assert.ok(inboundMethodStart >= 0)
  assert.ok(inboundMethodEnd > inboundMethodStart)

  const inboundMethod = dripsService.slice(
    inboundMethodStart,
    inboundMethodEnd,
  )

  assert.doesNotMatch(
    inboundMethod,
    /contact\.create/,
  )

assert.match(
  inboundMethod,
  /contact\.findFirst/,
)

assert.match(
  inboundMethod,
  /optedIn:\s*true/,
)

assert.match(
  inboundMethod,
  /optInSource:\s*\{\s*not:\s*null/,
)

assert.doesNotMatch(
  inboundMethod,
  /contact\.create/,
)

assert.doesNotMatch(
  inboundMethod,
  /contact\.update/,
)

assert.doesNotMatch(
  inboundMethod,
  /data:\s*\{[\s\S]*optedIn:\s*true/,
)
})

test('contact opt-out and deletion stop pending drip delivery', () => {
  const contactsService = read(
    '../src/services/contacts.service.ts',
  )

  const dripsService = read(
    '../src/services/drips.service.ts',
  )

  assert.match(
    contactsService,
    /stopContactDripEnrollments/,
  )

  assert.match(
    contactsService,
    /CONTACT_OPTED_OUT/,
  )

  assert.match(
    contactsService,
    /CONTACT_DELETED/,
  )

  assert.match(
    contactsService,
    /optInSource:\s*null/,
  )

  assert.match(
    dripsService,
    /status:\s*'CANCELED'/,
  )

  assert.match(
    dripsService,
    /Contact opted out/,
  )

  assert.match(
    dripsService,
    /Contact was deleted/,
  )

  assert.match(
    dripsService,
    /removeQueuedDripMessageJobs/,
  )
})

test('drip archive is permanent and cancels pending messages', () => {
  const service = read(
    '../src/services/drips.service.ts',
  )

  assert.match(
    service,
    /async archiveWorkflow/,
  )

  assert.match(
    service,
    /status:\s*'ARCHIVED'/,
  )

  assert.match(
    service,
    /archivedAt:\s*new Date\(\)/,
  )

  assert.match(
    service,
    /stopReason:\s*'WORKFLOW_ARCHIVED'/,
  )

  assert.match(
    service,
    /errorMessage:\s*'Workflow archived'/,
  )

  assert.match(
    service,
    /Archived drip workflows cannot be activated/,
  )

  assert.match(
    service,
    /Only active drip workflows can be paused/,
  )

  assert.match(
    service,
    /findQueuedDripMessageIds/,
  )

  assert.match(
    service,
    /removeDripMessageJob/,
  )
})

test('drip worker has a dedicated production entrypoint', () => {
  const packageJson = JSON.parse(read('../package.json'))
  const dripWorker = read('../src/workers/drip-worker.ts')

  assert.equal(
    packageJson.scripts['start:drip-worker'],
    'node dist/workers/drip-worker.js',
  )

  assert.equal(
    packageJson.scripts['start:dev:drip-worker'],
    'ts-node-dev --respawn --transpile-only src/workers/drip-worker.ts',
  )

  assert.match(
    dripWorker,
    /DripsWorkerModule/,
  )

  assert.match(
    dripWorker,
    /RedactingLogger/,
  )

  assert.match(
    dripWorker,
    /app\.useLogger\(logger\)/,
  )
})

test('manual drip retry cannot revive unrelated stopped enrolments', () => {
  const service = read(
    '../src/services/drips.service.ts',
  )

  assert.match(
    service,
    /async retryFailedDripMessage/,
  )

  assert.match(
    service,
    /status:\s*'STOPPED'/,
  )

  assert.match(
    service,
    /stopReason:\s*'DRIP_MESSAGE_FAILED'/,
  )

  assert.match(
    service,
    /The failed drip enrolment is no longer eligible for retry/,
  )

  assert.match(
    service,
    /The failed drip message is no longer eligible for retry/,
  )

  assert.match(
    service,
    /metaMessageId:\s*null/,
  )

  assert.match(
    service,
    /DRIP_MESSAGE_MANUAL_RETRY/,
  )
})

test('drip module circular dependency targets Meta accounts only', () => {
  const dripsModule = read(
    '../src/modules/drips.module.ts',
  )

  const metaAccountsModule = read(
    '../src/modules/meta-accounts.module.ts',
  )

  assert.match(
    dripsModule,
    /forwardRef\(\(\) => MetaAccountsModule\)/,
  )

  assert.doesNotMatch(
    dripsModule,
    /forwardRef\(\(\) => AuthModule\)/,
  )

  assert.match(
    metaAccountsModule,
    /forwardRef\(\(\) => DripsModule\)/,
  )
})

test('drip frontend is connected with role-aware controls', () => {
const app = read(
  '../../web/src/pages/App.tsx',
)

  const dripsPage = read(
    '../../web/src/pages/DripsPage.tsx',
  )

  assert.match(
    app,
    /DripsPage/,
  )

  assert.match(
    app,
    /Drip Automation/,
  )

  assert.match(
    app,
    /getVisibleModules/,
  )

  assert.match(
    dripsPage,
    /'platform_admin'/,
  )

  assert.match(
    dripsPage,
    /'super_admin'/,
  )

  assert.match(
    dripsPage,
    /credentials:\s*'include'/,
  )

  assert.match(
    dripsPage,
    /\/drips\/\$\{selectedWorkflow\.id\}\/enroll/,
  )

  assert.match(
    dripsPage,
    /\/messages\/\$\{messageId\}\/retry/,
  )

  assert.match(
    dripsPage,
    /\/drips\/\$\{workflowId\}\/summary/,
  )

  assert.match(
    dripsPage,
    /Type at least 2 characters to search contacts/,
  )

  assert.match(
    dripsPage,
    /getTemplateVariableCount/,
  )

  assert.match(
    dripsPage,
    /Create Workflow/,
  )

  assert.doesNotMatch(
    dripsPage,
    /localStorage/,
  )

  assert.doesNotMatch(
    dripsPage,
    /tenantId\s*:/,
  )
})

test('drip migration preserves existing data while adding required fields', () => {
  const migration = read(
    '../prisma/migrations/20260717190000_complete_secure_drips/migration.sql',
  )

  assert.match(
    migration,
    /ADD COLUMN IF NOT EXISTS "enrollmentCycle"/,
  )

  assert.match(
    migration,
    /DEFAULT 1/,
  )

  assert.match(
    migration,
    /ADD COLUMN IF NOT EXISTS "metaHeaderMediaId"/,
  )

  assert.match(
    migration,
    /ADD COLUMN IF NOT EXISTS "metaHeaderMediaUploadedAt"/,
  )

  assert.match(
    migration,
    /ADD COLUMN IF NOT EXISTS "archivedAt"/,
  )

  assert.match(
    migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS/,
  )

  assert.match(
    migration,
    /"workflowId",\s*"contactId",\s*"enrollmentCycle"/,
  )

  assert.doesNotMatch(
    migration,
    /DROP TABLE/,
  )

  assert.doesNotMatch(
    migration,
    /DELETE FROM/,
  )

  assert.doesNotMatch(
    migration,
    /TRUNCATE/,
  )
})

test(
  'conversation schema is tenant isolated and message idempotent',
  () => {
    const schema = read(
      '../prisma/schema.prisma',
    )

    assert.match(
      schema,
      /model Conversation \{/,
    )

    assert.match(
      schema,
      /model WhatsappMessage \{/,
    )

    assert.match(
      schema,
      /model ConversationAssignment \{/,
    )

    assert.match(
      schema,
      /@@unique\(\[tenantId, customerPhone, metaAccountId\]\)/,
    )

    assert.match(
      schema,
      /metaMessageId\s+String\?\s+@unique/,
    )

    assert.match(
      schema,
      /@@unique\(\[tenantId, idempotencyKey\]\)/,
    )

    assert.match(
      schema,
      /@@index\(\[tenantId, conversationId, occurredAt\]\)/,
    )
  },
)

test(
  'conversation routes derive tenant from authenticated backend context',
  () => {
    const controller = read(
      '../src/controller/conversations.controller.ts',
    )

    assert.match(
      controller,
      /requireUserFromRequest\(request\)/,
    )

    assert.match(
      controller,
      /user\.tenantId/,
    )

    assert.match(
      controller,
      /requireRole\(\s*user,\s*conversationUserRoles,\s*\)/,
    )

    assert.match(
      controller,
      /requireRole\(\s*user,\s*conversationManagerRoles,\s*\)/,
    )

    assert.match(
      controller,
      /blockImpersonationWrites/,
    )

    assert.doesNotMatch(
      controller,
      /body\.tenantId/,
    )

    assert.doesNotMatch(
      controller,
      /query\.tenantId/,
    )
  },
)

test(
  'conversation service scopes ownership and updates by tenant',
  () => {
    const service = read(
      '../src/services/conversations.service.ts',
    )

    assert.match(
      service,
      /conversation-assignment:\$\{tenantId\}:\$\{conversationId\}/,
    )

    assert.match(
      service,
      /conversation-inbound:\$\{tenantId\}:\$\{phoneNumberId\}:\$\{fromPhone\}/,
    )

    assert.match(
      service,
      /id:\s*conversationId,\s*tenantId/,
    )

    assert.match(
      service,
      /id:\s*assignedUserId,\s*tenantId,\s*isActive:\s*true/,
    )

    assert.match(
      service,
      /tenantId_phone:/,
    )

    assert.match(
      service,
      /tenantId_customerPhone_metaAccountId:/,
    )

    assert.match(
      service,
      /assertCanCreateContactsInTransaction/,
    )

    assert.match(
      service,
      /metaMessageId/,
    )
  },
)

test(
  'verified Meta webhooks persist inbound messages before drip automation',
  () => {
    const service = read(
      '../src/services/meta-accounts.service.ts',
    )

    assert.match(
      service,
      /ConversationsService/,
    )

    assert.match(
      service,
      /ingestInboundMessage/,
    )

    assert.match(
      service,
      /webhookEventId/,
    )

    assert.match(
      service,
      /phoneNumberId:\s*inboundMessage\.phoneNumberId/,
    )

    const persistenceIndex =
      service.indexOf(
        'this.conversationsService',
      )

    const ingestIndex =
      service.indexOf(
        '.ingestInboundMessage',
        persistenceIndex,
      )

    const dripIndex =
      service.indexOf(
        'this.dripsService',
        ingestIndex,
      )

    const autoEnrollIndex =
      service.indexOf(
        '.autoEnrollInboundContact',
        dripIndex,
      )

    assert.ok(
      persistenceIndex >= 0,
    )

    assert.ok(
      ingestIndex > persistenceIndex,
    )

    assert.ok(
      dripIndex > ingestIndex,
    )

    assert.ok(
      autoEnrollIndex > dripIndex,
    )
  },
)

test(
  'conversation migration only adds tenant-safe tables and indexes',
  () => {
    const migration = read(
      '../prisma/migrations/20260720160000_add_conversations_core/migration.sql',
    )

    assert.match(
      migration,
      /CREATE TABLE "conversations"/,
    )

    assert.match(
      migration,
      /CREATE TABLE "whatsapp_messages"/,
    )

    assert.match(
      migration,
      /CREATE TABLE "conversation_assignments"/,
    )

    assert.match(
      migration,
      /conversations_tenantId_customerPhone_metaAccountId_key/,
    )

    assert.match(
      migration,
      /whatsapp_messages_metaMessageId_key/,
    )

    assert.match(
      migration,
      /FOREIGN KEY \("tenantId"\)\s+REFERENCES "tenants"/,
    )

    assert.doesNotMatch(
      migration,
      /DROP TABLE/,
    )

    assert.doesNotMatch(
      migration,
      /DELETE FROM/,
    )

    assert.doesNotMatch(
      migration,
      /TRUNCATE/,
    )
  },
)
test(
  'outbound message schema stores queue state and tenant-owned template',
  () => {
    const schema = read(
      '../prisma/schema.prisma',
    )

    assert.match(
      schema,
      /templateId\s+String\?/,
    )

    assert.match(
      schema,
      /failureClass\s+String\?/,
    )

    assert.match(
      schema,
      /retryCount\s+Int\s+@default\(0\)/,
    )

    assert.match(
      schema,
      /queuedAt\s+DateTime\?/,
    )

    assert.match(
      schema,
      /processingStartedAt\s+DateTime\?/,
    )

    assert.match(
      schema,
      /nextRetryAt\s+DateTime\?/,
    )

    assert.match(
      schema,
      /template\s+WhatsappTemplate\?\s+@relation/,
    )

    assert.match(
      schema,
      /@@index\(\[tenantId, status, nextRetryAt\]\)/,
    )

    assert.match(
      schema,
      /outboundMessages\s+WhatsappMessage\[\]/,
    )
  },
)

test(
  'outbound message queue uses deterministic jobs and bounded retries',
  () => {
    const queue = read(
      '../src/Queues/messages.queue.ts',
    )

    assert.match(
      queue,
      /OUTBOUND_MESSAGE_QUEUE/,
    )

    assert.match(
      queue,
      /outbound-message-\$\{whatsappMessageId\}/,
    )

    assert.match(
      queue,
      /attempts:\s*3/,
    )

    assert.match(
      queue,
      /type:\s*'exponential'/,
    )

    assert.match(
      queue,
      /delay:\s*5000/,
    )

    assert.match(
      queue,
      /'active'/,
    )

    assert.match(
      queue,
      /'waiting'/,
    )

    assert.match(
      queue,
      /'delayed'/,
    )

    assert.match(
      queue,
      /reusableStates\.has\(state\)/,
    )

    assert.match(
      queue,
      /return existingJob/,
    )

    assert.match(
      queue,
      /if \(state === 'active'\)/,
    )
  },
)

test(
  'outbound queue module is registered without starting a worker in the API',
  () => {
    const module = read(
      '../src/modules/outbound-messages.module.ts',
    )

    const appModule = read(
      '../src/modules/app.module.ts',
    )

    assert.match(
      module,
      /MessagesQueue/,
    )

    assert.match(
      module,
      /exports:\s*\[\s*MessagesQueue/,
    )

    assert.doesNotMatch(
      module,
      /MessagesProcessor/,
    )

    assert.match(
      appModule,
      /OutboundMessagesModule/,
    )
  },
)