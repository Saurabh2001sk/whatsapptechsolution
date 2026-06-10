const SAAS_PLANS = {
  trial: {
    name: 'Trial',
    priceMonthlyInr: 0,
    users: 3,
    contacts: 1000,
    storageGb: 2,
    premiumFeatures: false,
    messageLimitMode: 'waba',
  },

  premium: {
    name: 'Premium',
    priceMonthlyInr: 9999,
    users: -1,
    contacts: -1,
    storageGb: -1,
    premiumFeatures: true,
    messageLimitMode: 'waba',
  },

  internal: {
    name: 'Internal',
    priceMonthlyInr: 0,
    users: -1,
    contacts: -1,
    storageGb: -1,
    premiumFeatures: true,
    messageLimitMode: 'waba',
  },
};

function getSaasPlan(planName) {
  const cleanPlan = String(planName || 'trial').trim().toLowerCase();

  if (cleanPlan === 'starter') return SAAS_PLANS.trial;
  if (cleanPlan === 'growth') return SAAS_PLANS.premium;
  if (cleanPlan === 'business') return SAAS_PLANS.premium;
  if (cleanPlan === 'enterprise') return SAAS_PLANS.premium;

  return SAAS_PLANS[cleanPlan] || SAAS_PLANS.trial;
}

module.exports = {
  SAAS_PLANS,
  getSaasPlan,
};