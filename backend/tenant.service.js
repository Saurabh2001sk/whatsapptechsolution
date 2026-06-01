function createTenantService({
  query,
  isProduction,
  hasRealValue,
}) {
  let demoTenantId = null;

  function normalizeTenantSlug(value = '') {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  }

  function publicTenant(tenant) {
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      industry: tenant.industry,
      status: tenant.status,
      plan: tenant.plan,
      logoUrl: tenant.logo_url || '',
      businessPhone: tenant.business_phone || '',
      businessEmail: tenant.business_email || '',
      metaBusinessId: tenant.meta_business_id || '',
      onboardingStatus: tenant.onboarding_status || 'pending',
      createdAt: tenant.created_at,
      updatedAt: tenant.updated_at,
    };
  }

  async function countActiveTenantAdmins(tenantId, excludeUserId = null) {
    const params = [tenantId];
    let excludeSql = '';

    if (excludeUserId) {
      params.push(excludeUserId);
      excludeSql = `AND id <> $${params.length}`;
    }

    const result = await query(
      `SELECT COUNT(*)::int AS count
       FROM users
       WHERE tenant_id = $1
         AND role = 'admin'
         AND active = true
         ${excludeSql}`,
      params,
    );

    return result.rows[0]?.count || 0;
  }

  async function getDemoTenantId() {
    if (demoTenantId) return demoTenantId;

    const result = await query(
      `INSERT INTO tenants (name, slug, industry, status, plan)
       VALUES ('Demo Company', 'demo', 'General', 'active', 'starter')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
    );

    demoTenantId = result.rows[0].id;
    return demoTenantId;
  }

  async function ensureDefaultWhatsAppAccountMapping(displayPhoneNumber = null) {
    if (isProduction) {
      return null;
    }

    const phoneNumberId = String(process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();

    if (!hasRealValue(phoneNumberId)) {
      return null;
    }

    const tenantId = await getDemoTenantId();

    const result = await query(
      `INSERT INTO whatsapp_accounts (tenant_id, phone_number_id, display_phone_number, active)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (phone_number_id)
       DO UPDATE SET display_phone_number = COALESCE(EXCLUDED.display_phone_number, whatsapp_accounts.display_phone_number),
                     active = true
       RETURNING tenant_id`,
      [tenantId, phoneNumberId, displayPhoneNumber || null],
    );

    return result.rows[0]?.tenant_id || null;
  }

  async function getEnvWhatsAppAccountStatus(tenantId = null) {
    const phoneNumberId = String(process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();

    if (!hasRealValue(phoneNumberId)) {
      return {
        phoneNumberMapped: false,
        phoneNumberMappedToCurrentTenant: false,
        phoneNumberMappedTenantSlug: null,
      };
    }

    const result = await query(
      `SELECT whatsapp_accounts.tenant_id, whatsapp_accounts.active, tenants.slug
       FROM whatsapp_accounts
       JOIN tenants ON tenants.id = whatsapp_accounts.tenant_id
       WHERE whatsapp_accounts.phone_number_id = $1
       LIMIT 1`,
      [phoneNumberId],
    );

    const account = result.rows[0];

    return {
      phoneNumberMapped: Boolean(account?.active),
      phoneNumberMappedToCurrentTenant: Boolean(account?.active && tenantId && account.tenant_id === tenantId),
      phoneNumberMappedTenantSlug: account?.slug || null,
    };
  }

  async function getTenantIdForWebhookValue(value = {}) {
    const phoneNumberId = String(value?.metadata?.phone_number_id || '').trim();

    if (!phoneNumberId) {
      return null;
    }

    const mapped = await query(
      `SELECT tenants.id
       FROM whatsapp_accounts
       JOIN tenants ON tenants.id = whatsapp_accounts.tenant_id
       WHERE whatsapp_accounts.phone_number_id = $1
         AND whatsapp_accounts.active = true
         AND tenants.status = 'active'
       LIMIT 1`,
      [phoneNumberId],
    );

    if (mapped.rows[0]?.id) {
      return mapped.rows[0].id;
    }

    if (!isProduction && phoneNumberId === String(process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim()) {
      return ensureDefaultWhatsAppAccountMapping(value?.metadata?.display_phone_number || null);
    }

    return null;
  }

  return {
    normalizeTenantSlug,
    publicTenant,
    countActiveTenantAdmins,
    getDemoTenantId,
    ensureDefaultWhatsAppAccountMapping,
    getEnvWhatsAppAccountStatus,
    getTenantIdForWebhookValue,
  };
}

module.exports = {
  createTenantService,
};
