CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =========================================================
-- 1. TENANTS / COMPANIES
-- =========================================================

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  industry TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  plan TEXT NOT NULL DEFAULT 'starter',
  subscription_status TEXT NOT NULL DEFAULT 'trial',
  trial_ends_at TIMESTAMPTZ DEFAULT (now() + interval '14 days'),
  subscription_ends_at TIMESTAMPTZ,
  suspended_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO tenants (
  name,
  slug,
  industry,
  status,
  plan,
  subscription_status,
  trial_ends_at,
  subscription_ends_at,
  suspended_reason
)
VALUES (
  'Demo Company',
  'demo',
  'General',
  'active',
  'starter',
  'trial',
  now() + interval '14 days',
  NULL,
  NULL
)
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
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'manager', 'sales')),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================================
-- PLATFORM / SUPER ADMIN SUPPORT
-- =========================================================

INSERT INTO tenants (
  name,
  slug,
  industry,
  status,
  plan,
  subscription_status,
  trial_ends_at,
  subscription_ends_at,
  suspended_reason
)
VALUES (
  'Platform Admin',
  'platform',
  'SaaS Platform',
  'active',
  'internal',
  'active',
  NULL,
  NULL,
  NULL
)
ON CONFLICT (slug) DO UPDATE SET
  plan = 'internal',
  subscription_status = 'active',
  trial_ends_at = NULL,
  subscription_ends_at = NULL,
  suspended_reason = NULL;

DO $$
BEGIN
  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
  ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('super_admin', 'admin', 'manager', 'sales'));
END $$;

ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS logo_url TEXT;

ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS business_phone TEXT;

ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS business_email TEXT;

ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS meta_business_id TEXT;

ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS onboarding_status TEXT NOT NULL DEFAULT 'pending';

ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS tenants_status_idx
ON tenants (status);

CREATE INDEX IF NOT EXISTS users_role_idx
ON users (role);

CREATE INDEX IF NOT EXISTS users_tenant_role_idx
ON users (tenant_id, role, active);

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

ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS marketing_opted_in BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS marketing_opted_in_at TIMESTAMPTZ;

ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS marketing_opt_in_source TEXT;

ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS marketing_opt_in_proof TEXT;

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
ADD COLUMN IF NOT EXISTS media_storage_provider TEXT;

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS media_storage_key TEXT;

CREATE INDEX IF NOT EXISTS messages_tenant_media_storage_idx
ON messages (tenant_id, media_storage_key)
WHERE media_storage_key IS NOT NULL;

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

-- Tenant-owned item relationships. These keep sales item rows from pointing
-- at a quotation, order, or product that belongs to another tenant.
CREATE UNIQUE INDEX IF NOT EXISTS quotations_tenant_id_id_uidx
ON quotations (tenant_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS sales_orders_tenant_id_id_uidx
ON sales_orders (tenant_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS products_tenant_id_id_uidx
ON products (tenant_id, id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotation_items_tenant_quotation_fk'
  ) THEN
    ALTER TABLE quotation_items
    ADD CONSTRAINT quotation_items_tenant_quotation_fk
    FOREIGN KEY (tenant_id, quotation_id)
    REFERENCES quotations (tenant_id, id)
    ON DELETE CASCADE
    NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotation_items_tenant_product_fk'
  ) THEN
    ALTER TABLE quotation_items
    ADD CONSTRAINT quotation_items_tenant_product_fk
    FOREIGN KEY (tenant_id, product_id)
    REFERENCES products (tenant_id, id)
    NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_order_items_tenant_order_fk'
  ) THEN
    ALTER TABLE sales_order_items
    ADD CONSTRAINT sales_order_items_tenant_order_fk
    FOREIGN KEY (tenant_id, order_id)
    REFERENCES sales_orders (tenant_id, id)
    ON DELETE CASCADE
    NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_order_items_tenant_product_fk'
  ) THEN
    ALTER TABLE sales_order_items
    ADD CONSTRAINT sales_order_items_tenant_product_fk
    FOREIGN KEY (tenant_id, product_id)
    REFERENCES products (tenant_id, id)
    NOT VALID;
  END IF;
END $$;

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
ALTER TABLE whatsapp_accounts
ADD COLUMN IF NOT EXISTS access_token_encrypted TEXT;

ALTER TABLE whatsapp_accounts
ADD COLUMN IF NOT EXISTS access_token_iv TEXT;

ALTER TABLE whatsapp_accounts
ADD COLUMN IF NOT EXISTS access_token_tag TEXT;

ALTER TABLE whatsapp_accounts
ADD COLUMN IF NOT EXISTS token_type TEXT DEFAULT 'business_integration_system_user';

ALTER TABLE whatsapp_accounts
ADD COLUMN IF NOT EXISTS connected_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE whatsapp_accounts
ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ;

ALTER TABLE whatsapp_accounts
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS whatsapp_accounts_tenant_phone_idx
ON whatsapp_accounts (tenant_id, phone_number_id);

CREATE INDEX IF NOT EXISTS whatsapp_accounts_waba_idx
ON whatsapp_accounts (waba_id);


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

ALTER TABLE whatsapp_templates
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'utility';

ALTER TABLE whatsapp_templates
ADD COLUMN IF NOT EXISTS meta_status TEXT DEFAULT 'manual';

ALTER TABLE whatsapp_templates
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

ALTER TABLE whatsapp_templates
ADD COLUMN IF NOT EXISTS meta_payload JSONB DEFAULT '{}'::jsonb;

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
-- 12B. AUTO REPLY RULES
-- =========================================================

CREATE TABLE IF NOT EXISTS auto_reply_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL DEFAULT 'contains',
  trigger_value TEXT NOT NULL,
  reply_text TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT true,
  send_once_per_contact BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (trigger_type IN ('contains', 'starts_with', 'exact'))
);

CREATE INDEX IF NOT EXISTS auto_reply_rules_tenant_active_idx
ON auto_reply_rules (tenant_id, active, priority, updated_at);

CREATE INDEX IF NOT EXISTS auto_reply_rules_tenant_trigger_idx
ON auto_reply_rules (tenant_id, trigger_type, active);

CREATE TABLE IF NOT EXISTS auto_reply_rule_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES auto_reply_rules(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  inbound_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  outbound_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auto_reply_rule_events_tenant_contact_idx
ON auto_reply_rule_events (tenant_id, contact_id, rule_id, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS auto_reply_rule_events_once_per_contact_idx
ON auto_reply_rule_events (tenant_id, rule_id, contact_id)
WHERE rule_id IS NOT NULL;

-- =========================================================
-- 13A. COMPANY KNOWLEDGE BASE
-- =========================================================

CREATE TABLE IF NOT EXISTS knowledge_base (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  content TEXT NOT NULL,
  keywords TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_base_tenant_active_idx
ON knowledge_base (tenant_id, active, updated_at);

CREATE INDEX IF NOT EXISTS knowledge_base_tenant_category_idx
ON knowledge_base (tenant_id, category, active);

-- =========================================================
-- 14. AUDIT EVENTS
-- =========================================================

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  requested_ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user
  ON password_reset_tokens(user_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash
  ON password_reset_tokens(token_hash);

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
-- 14A. WEBHOOK EVENTS / SAFE INBOUND QUEUE
-- =========================================================

CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'meta_whatsapp',
  phone_number_id TEXT,
  event_type TEXT NOT NULL DEFAULT 'webhook',
  status TEXT NOT NULL DEFAULT 'received',
  payload JSONB NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processing_started_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ
);

ALTER TABLE webhook_events
ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE webhook_events
ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'meta_whatsapp';

ALTER TABLE webhook_events
ADD COLUMN IF NOT EXISTS phone_number_id TEXT;

ALTER TABLE webhook_events
ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'webhook';

ALTER TABLE webhook_events
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'received';

ALTER TABLE webhook_events
ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE webhook_events
ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE webhook_events
ADD COLUMN IF NOT EXISTS last_error TEXT;

ALTER TABLE webhook_events
ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE webhook_events
ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;

ALTER TABLE webhook_events
ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

ALTER TABLE webhook_events
ADD COLUMN IF NOT EXISTS event_hash TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'webhook_events_status_check'
  ) THEN
    ALTER TABLE webhook_events
    ADD CONSTRAINT webhook_events_status_check
    CHECK (status IN ('received', 'processing', 'processed', 'failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS webhook_events_tenant_status_idx
ON webhook_events (tenant_id, status, received_at);

CREATE INDEX IF NOT EXISTS webhook_events_phone_status_idx
ON webhook_events (phone_number_id, status, received_at);

CREATE INDEX IF NOT EXISTS webhook_events_received_idx
ON webhook_events (received_at);

CREATE UNIQUE INDEX IF NOT EXISTS webhook_events_provider_hash_idx
ON webhook_events (provider, event_hash)
WHERE event_hash IS NOT NULL;

-- =========================================================
-- 14B. OUTBOUND WHATSAPP MESSAGE QUEUE / SEND TRACKING
-- =========================================================

CREATE TABLE IF NOT EXISTS outbound_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  wa_message_id TEXT,
  to_phone TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  template_name TEXT,
  language TEXT,
  body TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE outbound_messages
ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE outbound_messages
ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL;

ALTER TABLE outbound_messages
ADD COLUMN IF NOT EXISTS wa_message_id TEXT;

ALTER TABLE outbound_messages
ADD COLUMN IF NOT EXISTS to_phone TEXT NOT NULL DEFAULT '';

ALTER TABLE outbound_messages
ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'text';

ALTER TABLE outbound_messages
ADD COLUMN IF NOT EXISTS template_name TEXT;

ALTER TABLE outbound_messages
ADD COLUMN IF NOT EXISTS language TEXT;

ALTER TABLE outbound_messages
ADD COLUMN IF NOT EXISTS body TEXT;

ALTER TABLE outbound_messages
ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE outbound_messages
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';

ALTER TABLE outbound_messages
ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE outbound_messages
ADD COLUMN IF NOT EXISTS last_error TEXT;

ALTER TABLE outbound_messages
ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

ALTER TABLE outbound_messages
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE outbound_messages
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE outbound_messages
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'outbound_messages_status_check'
  ) THEN
    ALTER TABLE outbound_messages
    ADD CONSTRAINT outbound_messages_status_check
    CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'cancelled'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS outbound_messages_tenant_status_idx
ON outbound_messages (tenant_id, status, created_at);

CREATE INDEX IF NOT EXISTS outbound_messages_contact_idx
ON outbound_messages (tenant_id, contact_id, created_at);

CREATE INDEX IF NOT EXISTS outbound_messages_wa_message_idx
ON outbound_messages (tenant_id, wa_message_id);

-- =========================================================
-- 15. WHATSAPP CAMPAIGNS + CONSENT
-- =========================================================

CREATE TABLE IF NOT EXISTS contact_consents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL DEFAULT 'marketing',
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  status TEXT NOT NULL,
  source TEXT NOT NULL,
  proof_text TEXT,
  recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_consents_tenant_contact_idx
ON contact_consents (tenant_id, contact_id, consent_type, channel, recorded_at DESC);

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  template_id UUID REFERENCES whatsapp_templates(id) ON DELETE SET NULL,
  template_name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  total_recipients INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campaigns_tenant_status_idx
ON campaigns (tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS campaign_recipients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  to_phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  skip_reason TEXT,
  outbound_message_id UUID REFERENCES outbound_messages(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campaign_recipients_campaign_idx
ON campaign_recipients (tenant_id, campaign_id, status);

CREATE INDEX IF NOT EXISTS campaign_recipients_contact_idx
ON campaign_recipients (tenant_id, contact_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contact_consents_status_check'
  ) THEN
    ALTER TABLE contact_consents
    ADD CONSTRAINT contact_consents_status_check
    CHECK (status IN ('opted_in', 'opted_out'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'campaigns_status_check'
  ) THEN
    ALTER TABLE campaigns
    ADD CONSTRAINT campaigns_status_check
    CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'partial_failed', 'failed', 'cancelled'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'campaign_recipients_status_check'
  ) THEN
    ALTER TABLE campaign_recipients
    ADD CONSTRAINT campaign_recipients_status_check
    CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped'));
  END IF;
END $$;

-- =========================================================
-- 16. DEFAULT TENANT TEMPLATES
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
-- 17. PERFORMANCE INDEXES
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

CREATE INDEX IF NOT EXISTS contacts_tenant_marketing_idx
ON contacts (tenant_id, marketing_opted_in, opted_out);

CREATE INDEX IF NOT EXISTS products_tenant_active_idx
ON products (tenant_id, active);

-- =========================================================
-- 18. DATA QUALITY CONSTRAINTS
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

ALTER TABLE quotations
ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'draft';

ALTER TABLE quotations
ADD COLUMN IF NOT EXISTS manager_approval_status TEXT NOT NULL DEFAULT 'not_requested';

ALTER TABLE quotations
ADD COLUMN IF NOT EXISTS manager_approval_requested_at TIMESTAMPTZ;

ALTER TABLE quotations
ADD COLUMN IF NOT EXISTS manager_approved_at TIMESTAMPTZ;

ALTER TABLE quotations
ADD COLUMN IF NOT EXISTS manager_rejected_at TIMESTAMPTZ;

ALTER TABLE quotations
ADD COLUMN IF NOT EXISTS manager_rejection_reason TEXT;

ALTER TABLE quotations
ADD COLUMN IF NOT EXISTS manager_phone TEXT;

ALTER TABLE quotations
ADD COLUMN IF NOT EXISTS customer_sent_at TIMESTAMPTZ;

ALTER TABLE quotations
ADD COLUMN IF NOT EXISTS revision_no INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  ALTER TABLE quotations DROP CONSTRAINT IF EXISTS quotations_status_check_v2;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotations_status_check_v3'
  ) THEN
    ALTER TABLE quotations
    ADD CONSTRAINT quotations_status_check_v3
    CHECK (status IN (
      'draft',
      'pending_manager_approval',
      'manager_approved',
      'manager_rejected_waiting_reason',
      'revision_required',
      'sent',
      'customer_sent',
      'accepted',
      'rejected',
      'expired',
      'converted',
      'lost'
    ));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotations_approval_status_check_v1'
  ) THEN
    ALTER TABLE quotations
    ADD CONSTRAINT quotations_approval_status_check_v1
    CHECK (approval_status IN (
      'draft',
      'pending_manager_approval',
      'manager_approved',
      'manager_rejected_waiting_reason',
      'revision_required',
      'customer_sent',
      'customer_approved',
      'customer_rejected',
      'converted_to_order',
      'lost'
    ));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotations_manager_approval_status_check_v1'
  ) THEN
    ALTER TABLE quotations
    ADD CONSTRAINT quotations_manager_approval_status_check_v1
    CHECK (manager_approval_status IN (
      'not_requested',
      'pending',
      'approved',
      'rejected',
      'waiting_reason',
      'revision_required'
    ));
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

-- =========================================================
-- 18. QUOTATION APPROVAL EVENTS
-- =========================================================

CREATE TABLE IF NOT EXISTS quotation_approval_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  actor_type TEXT NOT NULL DEFAULT 'system',
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_phone TEXT,
  action TEXT NOT NULL,
  reason TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quotation_approval_events_tenant_quote_idx
ON quotation_approval_events (tenant_id, quotation_id, created_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotation_approval_events_actor_type_check_v1'
  ) THEN
    ALTER TABLE quotation_approval_events
    ADD CONSTRAINT quotation_approval_events_actor_type_check_v1
    CHECK (actor_type IN ('system', 'sales', 'manager', 'customer'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotation_approval_events_action_check_v1'
  ) THEN
    ALTER TABLE quotation_approval_events
    ADD CONSTRAINT quotation_approval_events_action_check_v1
    CHECK (action IN (
      'sent_to_manager',
      'manager_approved',
      'manager_rejected',
      'manager_rejection_reason_received',
      'revision_created',
      'sent_to_customer',
      'customer_approved',
      'customer_rejected',
      'converted_to_order'
    ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS quotations_tenant_status_idx
ON quotations (tenant_id, status);

CREATE INDEX IF NOT EXISTS sales_orders_tenant_status_idx
ON sales_orders (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_contacts_tenant_updated_desc
ON contacts (tenant_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_contacts_tenant_last_inbound_desc
ON contacts (tenant_id, last_inbound_at DESC);

CREATE INDEX IF NOT EXISTS idx_contacts_tenant_assigned_updated_desc
ON contacts (tenant_id, assigned_to, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_contacts_tenant_label_updated_desc
ON contacts (tenant_id, label, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_tenant_contact_created_desc
ON messages (tenant_id, contact_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_tenant_status_created_desc
ON messages (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_tenant_wa_message_id
ON messages (tenant_id, wa_message_id)
WHERE wa_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_created_desc
ON audit_events (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_events_tenant_status_received_desc
ON webhook_events (tenant_id, status, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_outbound_messages_tenant_status_created_desc
ON outbound_messages (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_quotations_tenant_status_created_desc
ON quotations (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_orders_tenant_status_created_desc
ON sales_orders (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_tenant_active_name
ON products (tenant_id, active, name);

CREATE INDEX IF NOT EXISTS idx_campaigns_tenant_status_created_desc
ON campaigns (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_tenant_campaign_status
ON campaign_recipients (tenant_id, campaign_id, status);

CREATE INDEX IF NOT EXISTS idx_contact_consents_tenant_contact_recorded_desc
ON contact_consents (tenant_id, contact_id, recorded_at DESC);

-- =========================================================
-- 19. TALLY INTEGRATION
-- =========================================================

CREATE TABLE IF NOT EXISTS tally_settings (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  product_type TEXT NOT NULL DEFAULT 'tallyprime',
  gateway_url TEXT NOT NULL DEFAULT '',
  company_name TEXT NOT NULL DEFAULT '',
  sales_voucher_type TEXT NOT NULL DEFAULT 'Sales',
  sales_ledger_name TEXT NOT NULL DEFAULT 'Sales',
  sales_ledger_parent TEXT NOT NULL DEFAULT 'Sales Accounts',
  customer_ledger_parent TEXT NOT NULL DEFAULT 'Sundry Debtors',
  last_tested_at TIMESTAMPTZ,
  last_test_status TEXT,
  last_error TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE tally_settings
ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE tally_settings
ADD COLUMN IF NOT EXISTS product_type TEXT NOT NULL DEFAULT 'tallyprime';

ALTER TABLE tally_settings
ADD COLUMN IF NOT EXISTS gateway_url TEXT NOT NULL DEFAULT '';

ALTER TABLE tally_settings
ADD COLUMN IF NOT EXISTS company_name TEXT NOT NULL DEFAULT '';

ALTER TABLE tally_settings
ADD COLUMN IF NOT EXISTS sales_voucher_type TEXT NOT NULL DEFAULT 'Sales';

ALTER TABLE tally_settings
ADD COLUMN IF NOT EXISTS sales_ledger_name TEXT NOT NULL DEFAULT 'Sales';

ALTER TABLE tally_settings
ADD COLUMN IF NOT EXISTS sales_ledger_parent TEXT NOT NULL DEFAULT 'Sales Accounts';

ALTER TABLE tally_settings
ADD COLUMN IF NOT EXISTS customer_ledger_parent TEXT NOT NULL DEFAULT 'Sundry Debtors';

ALTER TABLE tally_settings
ADD COLUMN IF NOT EXISTS last_tested_at TIMESTAMPTZ;

ALTER TABLE tally_settings
ADD COLUMN IF NOT EXISTS last_test_status TEXT;

ALTER TABLE tally_settings
ADD COLUMN IF NOT EXISTS last_error TEXT;

ALTER TABLE tally_settings
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE tally_settings
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS tally_sync_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  tally_reference TEXT,
  request_xml TEXT,
  response_xml TEXT,
  error TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE tally_sync_logs
ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

UPDATE tally_sync_logs
SET tenant_id = (SELECT id FROM tenants WHERE slug = 'demo')
WHERE tenant_id IS NULL;

ALTER TABLE tally_sync_logs
ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tally_sync_logs_tenant_created_desc
ON tally_sync_logs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tally_sync_logs_tenant_entity
ON tally_sync_logs (tenant_id, entity_type, entity_id, status);


ALTER TABLE outbound_messages
  ADD COLUMN IF NOT EXISTS retryable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS final_failed_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_outbound_messages_auto_retry
  ON outbound_messages (status, retryable, next_retry_at, updated_at)
  WHERE status = 'failed';

ALTER TABLE users
ADD COLUMN IF NOT EXISTS totp_secret_encrypted text;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS totp_secret_iv text;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS totp_secret_tag text;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS totp_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS totp_enabled_at timestamptz;

DO $$
BEGIN
  ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;

  ALTER TABLE campaigns
  ADD CONSTRAINT campaigns_status_check
  CHECK (
    status IN (
      'draft',
      'scheduled',
      'queued',
      'sending',
      'sent',
      'partial_failed',
      'failed',
      'cancelled'
    )
  );
END $$;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'trial';

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ DEFAULT (now() + interval '14 days');

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS suspended_reason TEXT;