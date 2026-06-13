# SaaS Meta Platform Strategy

## Current Verdict

This project should use Meta as the WhatsApp transport backend, not as the full SaaS backend.

Meta should own:

- WhatsApp message delivery
- Incoming webhook delivery
- Message status updates
- WhatsApp Business Account and phone number infrastructure
- Template approval, quality, billing, and policy enforcement
- Media upload/download through Cloud API

This platform must still own:

- Tenants and workspaces
- Users, roles, login, 2FA, and sessions
- Tenant-to-WABA and tenant-to-phone-number mapping
- Encrypted access token storage
- CRM contacts, inbox assignment, notes, stages, labels, quotes, orders, and Tally sync
- Consent, opt-out, campaign recipient decisions, and audit history
- Retry queues, failed webhook/outbound monitoring, and support diagnostics
- Platform subscriptions, billing profile, limits, and access blocking

The correct SaaS model is: Meta is the official WhatsApp engine; this app is the tenant-aware CRM, workflow, compliance, and control layer.

## Why Not Store Everything in Meta

Meta does not replace the product database for this app.

Meta can tell the app that a WhatsApp event happened, but it does not manage this app's internal CRM workflow:

- Which tenant owns the customer
- Which salesperson owns the chat
- Whether the customer opted out inside this SaaS
- Whether the lead became a quotation or order
- Whether the tenant subscription is active
- Whether an outbound retry should be blocked
- Whether a manager approved a quotation
- Whether a Tally sync happened

If this data is not stored locally, the SaaS becomes only a thin WhatsApp sender and loses its pro-level business value.

## Data To Keep Locally

Keep this data because it is required for SaaS control, security, workflow, and support:

- `tenants`
- `users`
- `whatsapp_accounts`
- `contacts`
- `messages`
- `whatsapp_templates`
- `app_settings`
- `audit_events`
- `webhook_events`
- `outbound_messages`
- `contact_consents`
- `campaigns`
- `campaign_recipients`
- `products`
- `quotations`
- `quotation_items`
- `quotation_approval_events`
- `sales_orders`
- `sales_order_items`
- `tally_settings`
- `tally_sync_logs`

Keep message payloads only as much as needed for inbox display, audit, retry, diagnostics, and customer workflow. For scale, add retention rules instead of deleting the tables.

## Data To Avoid Storing Long Term

Avoid turning the app into a heavy data warehouse.

Do not store long-term unless there is a clear business reason:

- Full raw webhook payloads forever
- Full media binaries in the database
- Duplicate Meta template metadata that is never used in UI or sending logic
- Full access tokens in logs
- Personal contact details outside tenant-scoped business records
- Unbounded campaign/debug/error payloads

Recommended scale rule:

- Keep operational message records.
- Store media in S3/R2/Spaces, not Postgres.
- Keep raw webhook payloads for support windows, then archive or prune.
- Keep audit summaries longer than raw payloads.
- Query Meta live for status that Meta owns, such as template approval and WABA health, when the UI needs fresh truth.

## Current Project Fit

The current code already follows much of the right model:

- `backend/schema.sql` has tenant-owned tables with `tenant_id`.
- `backend/routes.js` maps Embedded Signup results into `whatsapp_accounts`.
- `backend/routes.js` rejects production phone mapping unless Meta Embedded Signup is used.
- `backend/services.js` maps incoming webhook `phone_number_id` back to the correct tenant.
- `backend/server.js` requires production secrets and encrypted Meta token support.
- `frontend/App.jsx` and `frontend/WorkspacePages.jsx` expose tenant onboarding, WhatsApp health, platform admin, billing, and control-center flows.

This means the next improvement should be tightening the SaaS/Meta boundary, not replacing the local DB.

## Recommended Improvement Roadmap

### Phase 1 - SaaS Safety Baseline

- Keep tenant-owned tables.
- Keep backend-only encrypted Meta tokens.
- Keep `/api/whatsapp/embedded-signup/complete` as the production connection path.
- Keep `/api/whatsapp/webhook` as the inbound event path.
- Keep webhook and outbound queues for retry safety.
- Add or verify data retention jobs for raw webhook payloads and old outbound failures.

### Phase 2 - Meta As Live Source For Meta-Owned Truth

Use Meta APIs live or cached briefly for:

- WABA phone status
- Template sync and template approval status
- Messaging quality indicators
- Business verification and eligibility status where available
- Media download from Meta before storing in object storage

Do not make users manually maintain Meta-owned truth in local forms when it can be synced.

### Phase 3 - Pro Multi-Tenant SaaS Controls

Strengthen:

- Super admin tenant lifecycle
- Subscription gates
- Tenant usage and limits
- Per-tenant WABA health cards
- Per-tenant campaign throttling
- Support-safe failed webhook replay
- Token disconnect/reconnect flow
- Data deletion and retention flow

### Phase 4 - Scale

Before production scale:

- Use Redis-backed rate limits.
- Run webhook, outbound, and campaign workers separately from the web service.
- Store media in S3/R2/Spaces.
- Add database backups.
- Add retention policies for raw webhook data.
- Add tenant-level export/delete tooling.
- Monitor Render logs for webhook failures, queue failures, and Meta API errors.

## Do Not Change Without Explicit Review

These are high-risk areas:

- Removing local `messages`, `contacts`, `audit_events`, or `webhook_events`
- Sending Meta access tokens to frontend code
- Trusting `tenantId` from frontend payloads
- Removing `req.user.tenantId` filters from backend queries
- Bypassing the 24-hour WhatsApp reply window
- Sending campaigns to opted-out contacts
- Storing media binaries directly in Postgres
- Logging raw Meta tokens, Authorization headers, or full sensitive payloads

## Official Meta References

- WhatsApp Business Platform overview: https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform
- WhatsApp Cloud API get started: https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started
- WhatsApp webhooks overview: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview/
- WhatsApp Embedded Signup overview: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview
