function getSubscriptionBlockReason(tenant) {
  if (!tenant) return 'Tenant missing';

  if (tenant.status === 'suspended') {
    return tenant.suspended_reason || 'Company account suspended';
  }

  if (tenant.status === 'inactive') {
    return 'Company account inactive';
  }

  if (tenant.subscription_status === 'suspended') {
    return tenant.suspended_reason || 'Subscription suspended';
  }

  if (tenant.subscription_status === 'expired') {
    return tenant.suspended_reason || 'Subscription expired';
  }

  if (
    tenant.subscription_status === 'trial'
    && tenant.trial_ends_at
    && new Date(tenant.trial_ends_at).getTime() < Date.now()
  ) {
    return 'Trial expired';
  }

  if (
    tenant.subscription_status === 'active'
    && tenant.subscription_ends_at
    && new Date(tenant.subscription_ends_at).getTime() < Date.now()
  ) {
    return 'Subscription expired';
  }

  return '';
}

function requireActiveSubscription(req, res, next) {
  const reason = getSubscriptionBlockReason(req.tenant);

  if (reason) {
    return res.status(403).json({
      error: reason,
      billingBlocked: true,
    });
  }

  return next();
}

module.exports = {
  getSubscriptionBlockReason,
  requireActiveSubscription,
};