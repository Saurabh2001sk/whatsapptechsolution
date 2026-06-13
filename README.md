# WhatsApp Official SaaS Platform

Tenant-aware WhatsApp Business Platform workspace for official Meta Cloud API onboarding, inbox operations, templates, campaigns, quotations, orders, billing visibility, and admin controls.

## Project Layout

- `backend/` - Express API, PostgreSQL data access, Meta Cloud API integration, queues, auth, tenant isolation, and production checks.
- `frontend/` - React/Vite SaaS workspace UI for public access, dashboard, inbox, templates, settings, sales, campaigns, and monitoring.
- `docs/` - Architecture and production strategy notes.

## Backend Entry Points

- `backend/server.js` - API bootstrap, runtime config checks, shared services, WhatsApp send/webhook helpers, and route registration.
- `backend/routes.js` - Protected API route groups for core platform, WhatsApp, CRM, sales, campaigns, and Tally.
- `backend/services.js` - Shared helpers for auth, rate limits, tenant limits, audit utilities, TOTP, media storage, and safe logging.
- `backend/queues.js` - Optional Redis/BullMQ queue tooling for outbound, webhook, and campaign workers.
- `backend/db.js` - PostgreSQL pool and health helpers.
- `backend/schema.sql` - Database schema used by `npm run init-db`.
- `backend/project.test.js` - Node test coverage for important auth, routing, and safety helpers.

## Frontend Entry Points

- `frontend/App.jsx` - App shell, public site, auth/session flow, navigation, data loading, and page routing.
- `frontend/WorkspacePages.jsx` - Workspace page components and module-level UI.
- `frontend/apiClient.js` - API client configuration and error formatting.
- `frontend/utils.jsx` - Shared UI/data helpers.
- `frontend/styles.css` - Main stylesheet.

## Local Development

Backend:

```bash
cd backend
npm install
npm run dev
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Verification

Run before committing or deploying:

```bash
cd backend
npm test
node --check server.js
node --check routes.js
node --check services.js
```

```bash
cd frontend
npm run lint
npm run build
```

## Security Notes

- Do not commit `.env` files or secrets.
- Keep Meta access tokens backend-only.
- Keep all protected tenant data scoped by `req.user.tenantId`.
- Use object storage for production media.
- Use approved WhatsApp templates outside the 24-hour customer service window.
- Review `docs/SAAS_META_PLATFORM_STRATEGY.md` before changing data ownership between this SaaS and Meta.
