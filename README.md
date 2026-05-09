# BOS WhatsApp Sales Inbox / CRM

This workspace has two apps:

- `backend`: Express API for Meta WhatsApp webhooks, login/roles, conversations, labels, assignment, templates, enquiry drafts, products, quotations, and sales orders.
- `frontend`: Vite React CRM inbox UI for admin, manager, and sales users.

## Demo Login

```text
admin@bos.com / admin123
manager@bos.com / manager123
sales@bos.com / sales123
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
FRONTEND_URL=https://your-frontend-service.onrender.com
PUBLIC_BASE_URL=https://your-backend-service.onrender.com
DATABASE_URL=your-render-postgres-internal-url
JWT_SECRET=use-a-long-random-secret
WHATSAPP_VERIFY_TOKEN=bos_verify_token_123
WHATSAPP_ACCESS_TOKEN=your-meta-access-token
WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id
WHATSAPP_API_VERSION=v20.0
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

After backend deploy, run the database init command once from Render Shell or locally against the Render database:

```bash
cd backend
npm run init-db
```

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
```

In Meta Developer Console, configure the webhook callback URL to:

```text
https://your-public-domain/webhook
```

For local testing, expose `http://localhost:5000` with a tunnel such as ngrok and use:

```text
https://your-ngrok-url/webhook
```

Use the same verify token that you put in `WHATSAPP_VERIFY_TOKEN`.

After filling `.env`, restart backend and check:

```text
http://localhost:5000/health
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

The backend runs without PostgreSQL by using demo in-memory data because `DATABASE_URL` is blank. For real usage, create a PostgreSQL database, run `backend/schema.sql`, and set:

```env
DATABASE_URL=postgres://user:password@localhost:5432/bos_whatsapp_inbox
```
