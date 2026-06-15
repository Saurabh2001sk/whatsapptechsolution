# Production Checklist

Before production scale, review `../docs/SAAS_META_PLATFORM_STRATEGY.md` so Meta-owned data, tenant-owned data, retention, and token-handling boundaries are clear.

## Required environment

- NODE_ENV=production
- DATABASE_URL set
- JWT_SECRET set to a real random 32+ character value
- PASSWORD_RESET_EMAIL_PROVIDER=resend
- RESEND_API_KEY set
- PASSWORD_RESET_FROM_EMAIL set
- FRONTEND_URL set to the production frontend origin
- PUBLIC_BASE_URL set to the production backend origin
- WHATSAPP_APP_SECRET set
- META_TOKEN_ENCRYPTION_KEY set to a 64-character hex key
- MEDIA_STORAGE_DRIVER=s3 for production media storage
- MEDIA_STORAGE_BUCKET set to the S3/R2/Spaces bucket name
- MEDIA_STORAGE_REGION set; use auto for Cloudflare R2 if required
- MEDIA_STORAGE_ENDPOINT set for R2/Spaces/S3-compatible providers
- MEDIA_STORAGE_ACCESS_KEY_ID set
- MEDIA_STORAGE_SECRET_ACCESS_KEY set
- MEDIA_STORAGE_FORCE_PATH_STYLE=true for most S3-compatible providers
- PGSSL_REJECT_UNAUTHORIZED=true unless your DB provider explicitly requires otherwise
- AUTO_MIGRATE_ON_START=false after initial setup; run npm run init-db intentionally when schema changes

## WhatsApp policy

- Free-form text only inside the 24-hour customer service window
- Approved templates only outside the 24-hour window
- Marketing campaigns only to opted-in contacts
- Opt-out contacts must never receive campaigns
- Webhook signatures must be verified
- Access tokens must never be exposed to frontend
- Campaign failures/quality risks must be monitored

## Tenant isolation

- Every business table must have tenant_id
- Every protected SELECT/UPDATE/DELETE must filter by req.user.tenantId
- Every protected INSERT must use req.user.tenantId
- Never trust tenantId from frontend body/query
- WhatsApp account tokens must be tenant-owned

## Data/security

- Do not log full tokens, passwords, or raw Authorization headers
- Do not log password reset links or reset tokens; send them only through the configured email provider
- Media must be served through protected backend routes
- Use S3/R2/Spaces with signed access before production scale
- Keep raw webhook and retry payload retention bounded; do not store unneeded Meta payloads forever
- Keep CRM, consent, audit, quote/order, and tenant records locally because Meta does not replace the SaaS workflow database
- Add Redis-backed rate limits before multi-instance deployment
- Add backups and retention policy before customer launch

## Deployment checks

- Run npm run init-db
- Run npm test
- Verify /health
- Verify /ready
- Login as admin, manager, sales
- Test tenant isolation manually with different users
- Test opt-out flow
- Test 24-hour window enforcement
- Test approved template send
- Test webhook signature verification
