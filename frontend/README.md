# BOS WhatsApp Sales Inbox / CRM

This workspace has two apps:

- `backend`: Express API for Meta WhatsApp webhooks, login/roles, conversations, labels, assignment, templates, enquiry drafts, products, quotations, and sales orders.
- `frontend`: Vite React CRM inbox UI for admin, manager, and sales users.

Reference/setup-only files are kept in `z-extra-files/` so the runtime folders stay focused and appears after the main app folders.

## Client Customization

Admin/Manager users can configure the app from the frontend Settings page:

- App name, client company name, industry, and theme color
- Custom lead labels and sales stages
- Currency, quotation prefix, and order prefix
- Bot greeting, bot handoff keywords, and inventory fields

These settings are persisted in the backend `app_settings` table and let each buyer adapt the same product to their workflow without code changes.

## Demo Login

```text
admin@bos.com / AdminDemo@12345
manager@bos.com / ManagerDemo@12345
sales@bos.com / SalesDemo@12345
```

Roles:

- `admin`: full monitoring and assignment
- `manager`: team monitoring and assignment
- `sales`: assigned conversations only

## Run

Backend:

```bash
cd backend
npm run dev
```

Frontend:

```bash
cd frontend
npm run dev
```

Open `http://127.0.0.1:5173`.

## Render Deployment

Deploy this repo as two Render services.

Backend Web Service:

```text
Root Directory: backend
Build Command: npm install
Start Command: npm start
```

Backend environment variables:

```env
PORT=10000
NODE_ENV=production
FRONTEND_URL=https://your-frontend-service.onrender.com
PUBLIC_BASE_URL=https://your-backend-service.onrender.com
DATABASE_URL=your-supabase-postgres-connection-string
JWT_SECRET=use-a-long-random-secret
WHATSAPP_VERIFY_TOKEN=bos_verify_token_123
WHATSAPP_ACCESS_TOKEN=your-meta-access-token
WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id
WHATSAPP_API_VERSION=v20.0
WHATSAPP_APP_SECRET=your-meta-app-secret
WHATSAPP_TEST_NUMBERS=919588462844
```

Frontend Static Site:

```text
Root Directory: frontend
Build Command: npm install && npm run build
Publish Directory: dist
```

Frontend environment variable:

```env
VITE_API_URL=https://your-backend-service.onrender.com
```

Auth sessions use a backend HttpOnly cookie. Do not store token or user session data in browser storage.

````md
After backend deploy, the backend applies `backend/schema.sql` automatically on startup.

For Supabase or any remote PostgreSQL database, the backend applies `backend/schema.sql` automatically on startup. You may also run this manually from the backend service shell:

```bash
cd backend
npm run init-db
```

`npm run init-db` detects remote PostgreSQL/Supabase and applies schema only. It does not try to create a database on Supabase.

Meta webhook callback URL after deploy:

```text
https://your-backend-service.onrender.com/webhook
```

## Meta WhatsApp Setup

Set these values in `backend/.env`:

```env
PUBLIC_BASE_URL=https://your-public-domain-or-ngrok-url
WHATSAPP_VERIFY_TOKEN=your-custom-verify-token
WHATSAPP_ACCESS_TOKEN=your-meta-access-token
WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id
WHATSAPP_API_VERSION=v20.0
WHATSAPP_APP_SECRET=your-meta-app-secret
WHATSAPP_TEST_NUMBERS=919588462844
```

Template env files are in:

```text
z-extra-files/backend.env.example
z-extra-files/frontend.env.example
```

In Meta Developer Console, configure the webhook callback URL to:

```text
https://your-public-domain/webhook
```

For deployed testing, use the Render backend webhook URL:

```text
https://your-backend-service.onrender.com/webhook
```

Use the same verify token that you put in `WHATSAPP_VERIFY_TOKEN`.

After filling Render environment variables, redeploy backend and check:

```text
https://your-backend-service.onrender.com/health
```

Then login as Admin or Manager and use the `Meta WhatsApp Setup` panel to send a test message. The recipient must be allowed by your Meta test setup or be a valid customer within your production WhatsApp Business account rules.

## CRM Flow

1. Customer sends WhatsApp message.
2. Meta webhook posts to `POST /webhook`.
3. Backend saves contact and message.
4. Message is auto-labelled as one of:
   `New Enquiry`, `Quotation Required`, `Dispatch Query`, `Payment Follow-up`, `Complaint`, `Review Required`.
5. Contact is assigned to the least-loaded sales user.
6. Sales user replies from the web panel through the same WhatsApp Business API number.
7. If the 24-hour WhatsApp reply window is expired, the UI supports approved template messages.
8. Product enquiry fields are auto-extracted into enquiry drafts with `source = WhatsApp Auto`.
9. Sales can review and mark the draft as created in ERP.

## Database

PostgreSQL is required. The backend will not start if `DATABASE_URL` is missing.

For Supabase usage, copy the PostgreSQL connection string from Supabase and set it on the Render backend service:

```env
DATABASE_URL=postgresql://postgres.your-project-ref:your-password@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
```

For Render usage, set `DATABASE_URL` to the Supabase PostgreSQL connection string. The backend applies `backend/schema.sql` automatically on startup.
