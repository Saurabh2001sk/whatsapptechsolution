const PLAN_LIMITS = {
  starter: {
    users: 3,
    contacts: 1000,
    templates: 25,
    products: 1000,
    campaignRecipientsPerRun: 500,
    outboundMessagesPerDay: 1000,
  },
  growth: {
    users: 10,
    contacts: 10000,
    templates: 100,
    products: 10000,
    campaignRecipientsPerRun: 5000,
    outboundMessagesPerDay: 10000,
  },
  business: {
    users: 50,
    contacts: 100000,
    templates: 500,
    products: 100000,
    campaignRecipientsPerRun: 25000,
    outboundMessagesPerDay: 50000,
  },
};

function normalizePlan(plan = 'starter') {
  const cleanPlan = String(plan || 'starter').trim().toLowerCase();
  return PLAN_LIMITS[cleanPlan] ? cleanPlan : 'starter';
}

function createLimitError(message) {
  const error = new Error(message);
  error.statusCode = 402;
  error.code = 'PLAN_LIMIT_REACHED';
  return error;
}

function createTenantLimitsService({ query }) {
  async function getTenantPlan(tenantId) {
    const result = await query(
      `SELECT plan
       FROM tenants
       WHERE id = $1
       LIMIT 1`,
      [tenantId],
    );

    return normalizePlan(result.rows[0]?.plan);
  }

  async function getTenantLimits(tenantId) {
    const plan = await getTenantPlan(tenantId);
    return {
      plan,
      ...PLAN_LIMITS[plan],
    };
  }

  async function countRows(tableName, tenantId, extraWhere = '') {
    const result = await query(
      `SELECT COUNT(*)::int AS count
       FROM ${tableName}
       WHERE tenant_id = $1
       ${extraWhere}`,
      [tenantId],
    );

    return Number(result.rows[0]?.count || 0);
  }

  async function assertTenantLimit({ tenantId, resource, add = 1 }) {
    const limits = await getTenantLimits(tenantId);
    const limit = Number(limits[resource] || 0);

    if (!limit) return limits;

    const tableMap = {
      users: { table: 'users', where: 'AND active = true' },
      contacts: { table: 'contacts', where: '' },
      templates: { table: 'whatsapp_templates', where: '' },
      products: { table: 'products', where: '' },
    };

    const tableInfo = tableMap[resource];

    if (!tableInfo) return limits;

    const currentCount = await countRows(tableInfo.table, tenantId, tableInfo.where);

    if (currentCount + add > limit) {
      throw createLimitError(`Plan limit reached: ${resource} limit is ${limit} on ${limits.plan} plan.`);
    }

    return limits;
  }

  async function assertCampaignRecipientLimit({ tenantId, recipientCount }) {
    const limits = await getTenantLimits(tenantId);

    if (Number(recipientCount || 0) > limits.campaignRecipientsPerRun) {
      throw createLimitError(
        `Plan limit reached: campaign can include maximum ${limits.campaignRecipientsPerRun} recipients on ${limits.plan} plan.`,
      );
    }

    return limits;
  }

  async function assertDailyOutboundLimit({ tenantId, add = 1 }) {
    const limits = await getTenantLimits(tenantId);

    const result = await query(
      `SELECT COUNT(*)::int AS count
       FROM outbound_messages
       WHERE tenant_id = $1
         AND created_at >= now() - interval '24 hours'`,
      [tenantId],
    );

    const currentCount = Number(result.rows[0]?.count || 0);

    if (currentCount + add > limits.outboundMessagesPerDay) {
      throw createLimitError(
        `Plan limit reached: daily outbound message limit is ${limits.outboundMessagesPerDay} on ${limits.plan} plan.`,
      );
    }

    return limits;
  }

  return {
    getTenantLimits,
    assertTenantLimit,
    assertCampaignRecipientLimit,
    assertDailyOutboundLimit,
  };
}

module.exports = {
  PLAN_LIMITS,
  createTenantLimitsService,
};