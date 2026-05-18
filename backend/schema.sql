CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =========================================================
-- 1. TENANTS / COMPANIES
-- =========================================================

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  industry TEXT NOT NULL DEFAULT 'General',
  status TEXT NOT NULL DEFAULT 'active',
  plan TEXT NOT NULL DEFAULT 'starter',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO tenants (name, slug, industry, status, plan)
VALUES ('Demo Company', 'demo', 'General', 'active', 'starter')
ON CONFLICT (slug) DO NOTHING;

-- =========================================================
-- 2. USERS
-- =========================================================

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'sales')),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users
ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

UPDATE users
SET tenant_id = (SELECT id FROM tenants WHERE slug = 'demo')
WHERE tenant_id IS NULL;

ALTER TABLE users
ALTER COLUMN tenant_id SET NOT NULL;

-- =========================================================
-- 3. CONTACTS / CONVERSATIONS
-- =========================================================

CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  wa_id TEXT NOT NULL,
  name TEXT,
  phone TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'new',
  label TEXT NOT NULL DEFAULT 'New Enquiry',
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  last_inbound_at TIMESTAMPTZ,
  owner TEXT,
  company TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, wa_id)
);

ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS label TEXT NOT NULL DEFAULT 'New Enquiry';

ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS last_inbound_at TIMESTAMPTZ;

ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS owner TEXT;

ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS company TEXT;

ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS opted_out BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS opted_out_at TIMESTAMPTZ;

ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS opted_out_reason TEXT;

UPDATE contacts
SET tenant_id = (SELECT id FROM tenants WHERE slug = 'demo')
WHERE tenant_id IS NULL;

ALTER TABLE contacts
ALTER COLUMN tenant_id SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_wa_id_key;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS contacts_tenant_wa_id_idx
ON contacts (tenant_id, wa_id);

-- =========================================================
-- 4. MESSAGES
-- =========================================================

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  wa_message_id TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  type TEXT NOT NULL DEFAULT 'text',
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'received',
  template_name TEXT,
  raw_payload JSONB,
  status_updated_at TIMESTAMPTZ,
  raw_status_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, wa_message_id)
);

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS template_name TEXT;

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ;

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS raw_status_payload JSONB;

UPDATE messages
SET tenant_id = (SELECT id FROM tenants WHERE slug = 'demo')
WHERE tenant_id IS NULL;

ALTER TABLE messages
ALTER COLUMN tenant_id SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_wa_message_id_key;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS messages_tenant_wa_message_id_idx
ON messages (tenant_id, wa_message_id)
WHERE wa_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS messages_tenant_contact_idx
ON messages (tenant_id, contact_id, created_at);

-- =========================================================
-- 4A. UNIVERSAL WHATSAPP MESSAGE FIELDS
-- =========================================================

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS wa_sender_id TEXT;

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS wa_recipient_id TEXT;

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS caption TEXT;

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS media_id TEXT;

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS media_url TEXT;

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS media_local_path TEXT;

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS mime_type TEXT;

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS file_name TEXT;

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS file_size BIGINT;

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS sha256 TEXT;

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS context_wa_message_id TEXT;

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS interactive_payload JSONB;

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS button_payload JSONB;

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS location_payload JSONB;

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS contacts_payload JSONB;

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS reaction_payload JSONB;

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS referral_payload JSONB;

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS unsupported_payload JSONB;

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS normalized_text TEXT;

CREATE INDEX IF NOT EXISTS messages_tenant_type_idx
ON messages (tenant_id, type, created_at);

CREATE INDEX IF NOT EXISTS messages_tenant_status_idx
ON messages (tenant_id, status, created_at);

CREATE INDEX IF NOT EXISTS messages_tenant_media_idx
ON messages (tenant_id, media_id)
WHERE media_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS messages_tenant_context_idx
ON messages (tenant_id, context_wa_message_id)
WHERE context_wa_message_id IS NOT NULL;

-- =========================================================
-- 5. ASSIGNMENT HISTORY
-- =========================================================

CREATE TABLE IF NOT EXISTS assignment_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  from_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE assignment_history
ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

UPDATE assignment_history
SET tenant_id = (SELECT id FROM tenants WHERE slug = 'demo')
WHERE tenant_id IS NULL;

ALTER TABLE assignment_history
ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS assignment_history_tenant_contact_idx
ON assignment_history (tenant_id, contact_id, created_at);

-- =========================================================
-- 6. PRODUCTS / INVENTORY
-- =========================================================

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  grade TEXT,
  size TEXT,
  shape TEXT,
  unit TEXT NOT NULL DEFAULT 'pcs',
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  stock_qty NUMERIC(12,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, sku)
);

ALTER TABLE products
ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE products
ADD COLUMN IF NOT EXISTS category TEXT;

ALTER TABLE products
ADD COLUMN IF NOT EXISTS grade TEXT;

ALTER TABLE products
ADD COLUMN IF NOT EXISTS size TEXT;

ALTER TABLE products
ADD COLUMN IF NOT EXISTS shape TEXT;

ALTER TABLE products
ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'pcs';

ALTER TABLE products
ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE products
ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE products
SET tenant_id = (SELECT id FROM tenants WHERE slug = 'demo')
WHERE tenant_id IS NULL;

ALTER TABLE products
ALTER COLUMN tenant_id SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE products DROP CONSTRAINT IF EXISTS products_sku_key;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS products_tenant_sku_idx
ON products (tenant_id, sku);

CREATE INDEX IF NOT EXISTS products_tenant_search_idx
ON products (tenant_id, active, name);

-- =========================================================
-- 7. QUOTATIONS
-- =========================================================

CREATE TABLE IF NOT EXISTS quotations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  quote_no TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'WhatsApp',
  valid_until DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, quote_no)
);

ALTER TABLE quotations
ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE quotations
ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'WhatsApp';

ALTER TABLE quotations
ADD COLUMN IF NOT EXISTS valid_until DATE;

UPDATE quotations
SET tenant_id = (SELECT id FROM tenants WHERE slug = 'demo')
WHERE tenant_id IS NULL;

ALTER TABLE quotations
ALTER COLUMN tenant_id SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE quotations DROP CONSTRAINT IF EXISTS quotations_quote_no_key;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS quotations_tenant_quote_no_idx
ON quotations (tenant_id, quote_no);

CREATE INDEX IF NOT EXISTS quotations_tenant_contact_idx
ON quotations (tenant_id, contact_id, created_at);

-- =========================================================
-- 8. SALES ORDERS
-- =========================================================

CREATE TABLE IF NOT EXISTS sales_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  order_no TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'WhatsApp',
  payment_status TEXT NOT NULL DEFAULT 'pending',
  dispatch_status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, order_no)
);

ALTER TABLE sales_orders
ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE sales_orders
ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'WhatsApp';

ALTER TABLE sales_orders
ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending';

ALTER TABLE sales_orders
ADD COLUMN IF NOT EXISTS dispatch_status TEXT NOT NULL DEFAULT 'pending';

UPDATE sales_orders
SET tenant_id = (SELECT id FROM tenants WHERE slug = 'demo')
WHERE tenant_id IS NULL;

ALTER TABLE sales_orders
ALTER COLUMN tenant_id SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE sales_orders DROP CONSTRAINT IF EXISTS sales_orders_order_no_key;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS sales_orders_tenant_order_no_idx
ON sales_orders (tenant_id, order_no);

CREATE INDEX IF NOT EXISTS sales_orders_tenant_contact_idx
ON sales_orders (tenant_id, contact_id, created_at);

-- =========================================================
-- 9. QUOTATION ITEMS
-- =========================================================

CREATE TABLE IF NOT EXISTS quotation_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  quotation_id UUID REFERENCES quotations(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  grade TEXT,
  size TEXT,
  shape TEXT,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'pcs',
  rate NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE quotation_items
ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

UPDATE quotation_items
SET tenant_id = (SELECT id FROM tenants WHERE slug = 'demo')
WHERE tenant_id IS NULL;

ALTER TABLE quotation_items
ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS quotation_items_tenant_quotation_idx
ON quotation_items (tenant_id, quotation_id);

-- =========================================================
-- 10. SALES ORDER ITEMS
-- =========================================================

CREATE TABLE IF NOT EXISTS sales_order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id UUID REFERENCES sales_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  grade TEXT,
  size TEXT,
  shape TEXT,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'pcs',
  rate NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE sales_order_items
ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

UPDATE sales_order_items
SET tenant_id = (SELECT id FROM tenants WHERE slug = 'demo')
WHERE tenant_id IS NULL;

ALTER TABLE sales_order_items
ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS sales_order_items_tenant_order_idx
ON sales_order_items (tenant_id, order_id);

-- =========================================================
-- 11. ENQUIRY DRAFTS
-- =========================================================

CREATE TABLE IF NOT EXISTS enquiry_drafts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  grade TEXT,
  size TEXT,
  shape TEXT,
  quantity TEXT,
  source TEXT NOT NULL DEFAULT 'WhatsApp Auto',
  status TEXT NOT NULL DEFAULT 'draft',
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  erp_enquiry_no TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE enquiry_drafts
ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

UPDATE enquiry_drafts
SET tenant_id = (SELECT id FROM tenants WHERE slug = 'demo')
WHERE tenant_id IS NULL;

ALTER TABLE enquiry_drafts
ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS enquiry_drafts_tenant_contact_idx
ON enquiry_drafts (tenant_id, contact_id, created_at);

-- =========================================================
-- 11A. WHATSAPP ACCOUNTS / PHONE NUMBER MAPPING
-- =========================================================

CREATE TABLE IF NOT EXISTS whatsapp_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone_number_id TEXT NOT NULL UNIQUE,
  display_phone_number TEXT,
  waba_id TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_accounts_tenant_active_idx
ON whatsapp_accounts (tenant_id, active);

-- =========================================================
-- 12. WHATSAPP TEMPLATES
-- =========================================================

CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  body TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name, language)
);

ALTER TABLE whatsapp_templates
ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

UPDATE whatsapp_templates
SET tenant_id = (SELECT id FROM tenants WHERE slug = 'demo')
WHERE tenant_id IS NULL;

ALTER TABLE whatsapp_templates
ALTER COLUMN tenant_id SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE whatsapp_templates DROP CONSTRAINT IF EXISTS whatsapp_templates_name_key;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_templates_tenant_name_language_idx
ON whatsapp_templates (tenant_id, name, language);

-- =========================================================
-- 13. APP SETTINGS
-- =========================================================

CREATE TABLE IF NOT EXISTS app_settings (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, key)
);

ALTER TABLE app_settings
ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

UPDATE app_settings
SET tenant_id = (SELECT id FROM tenants WHERE slug = 'demo')
WHERE tenant_id IS NULL;

ALTER TABLE app_settings
ALTER COLUMN tenant_id SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_pkey;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE app_settings
  ADD CONSTRAINT app_settings_pkey PRIMARY KEY (tenant_id, key);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- =========================================================
-- 14. AUDIT EVENTS
-- =========================================================

CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE audit_events
ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

UPDATE audit_events
SET tenant_id = (SELECT id FROM tenants WHERE slug = 'demo')
WHERE tenant_id IS NULL;

ALTER TABLE audit_events
ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS audit_events_tenant_created_idx
ON audit_events (tenant_id, created_at);

-- =========================================================
-- 15. DEFAULT TENANT TEMPLATES
-- =========================================================

INSERT INTO whatsapp_templates (tenant_id, name, language, body)
SELECT id, 'quotation_followup', 'en', 'Your quotation is ready. Please confirm.'
FROM tenants
WHERE slug = 'demo'
ON CONFLICT (tenant_id, name, language) DO NOTHING;

INSERT INTO whatsapp_templates (tenant_id, name, language, body)
SELECT id, 'payment_reminder', 'en', 'Payment follow-up for your pending order.'
FROM tenants
WHERE slug = 'demo'
ON CONFLICT (tenant_id, name, language) DO NOTHING;

INSERT INTO whatsapp_templates (tenant_id, name, language, body)
SELECT id, 'dispatch_update', 'en', 'Your dispatch update is available.'
FROM tenants
WHERE slug = 'demo'
ON CONFLICT (tenant_id, name, language) DO NOTHING;

INSERT INTO whatsapp_templates (tenant_id, name, language, body)
SELECT id, 'review_request', 'en', 'Please share your review for the recent order.'
FROM tenants
WHERE slug = 'demo'
ON CONFLICT (tenant_id, name, language) DO NOTHING;

-- =========================================================
-- 16. PERFORMANCE INDEXES
-- =========================================================

CREATE INDEX IF NOT EXISTS users_tenant_role_idx
ON users (tenant_id, role, active);

CREATE INDEX IF NOT EXISTS contacts_tenant_assigned_idx
ON contacts (tenant_id, assigned_to, updated_at);

CREATE INDEX IF NOT EXISTS contacts_tenant_label_idx
ON contacts (tenant_id, label);

CREATE INDEX IF NOT EXISTS contacts_tenant_stage_idx
ON contacts (tenant_id, stage);

CREATE INDEX IF NOT EXISTS contacts_tenant_phone_idx
ON contacts (tenant_id, phone);

CREATE INDEX IF NOT EXISTS products_tenant_active_idx
ON products (tenant_id, active);

-- =========================================================
-- 17. DATA QUALITY CONSTRAINTS
-- =========================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'messages_status_check_v2'
  ) THEN
    ALTER TABLE messages
    ADD CONSTRAINT messages_status_check_v2
    CHECK (status IN ('received', 'accepted', 'sent', 'delivered', 'read', 'failed'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contacts_stage_not_blank_check'
  ) THEN
    ALTER TABLE contacts
    ADD CONSTRAINT contacts_stage_not_blank_check
    CHECK (length(trim(stage)) > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotations_status_check_v2'
  ) THEN
    ALTER TABLE quotations
    ADD CONSTRAINT quotations_status_check_v2
    CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired', 'converted', 'lost'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_orders_status_check_v2'
  ) THEN
    ALTER TABLE sales_orders
    ADD CONSTRAINT sales_orders_status_check_v2
    CHECK (status IN ('pending', 'confirmed', 'processing', 'completed', 'closed', 'cancelled'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_orders_payment_status_check_v2'
  ) THEN
    ALTER TABLE sales_orders
    ADD CONSTRAINT sales_orders_payment_status_check_v2
    CHECK (payment_status IN ('pending', 'partial', 'paid', 'overdue', 'cancelled'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_orders_dispatch_status_check_v2'
  ) THEN
    ALTER TABLE sales_orders
    ADD CONSTRAINT sales_orders_dispatch_status_check_v2
    CHECK (dispatch_status IN ('pending', 'packed', 'dispatched', 'delivered', 'cancelled'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_price_non_negative_check'
  ) THEN
    ALTER TABLE products
    ADD CONSTRAINT products_price_non_negative_check
    CHECK (price >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_stock_non_negative_check'
  ) THEN
    ALTER TABLE products
    ADD CONSTRAINT products_stock_non_negative_check
    CHECK (stock_qty >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS quotations_tenant_status_idx
ON quotations (tenant_id, status);

CREATE INDEX IF NOT EXISTS sales_orders_tenant_status_idx
ON sales_orders (tenant_id, status);