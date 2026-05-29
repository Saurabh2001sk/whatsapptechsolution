function createAuditService({
  query,
}) {
  async function recordAudit({ tenantId, actorUserId, action, entityType, entityId, metadata = {} }) {
    if (!action || !entityType || !tenantId) return null;

    const result = await query(
      `INSERT INTO audit_events (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [tenantId, actorUserId || null, action, entityType, entityId || null, metadata],
    );

    return result.rows[0];
  }

  async function recordAssignmentHistory({ tenantId, contactId, fromUserId, toUserId, changedBy, reason }) {
    if (!contactId || !tenantId || fromUserId === toUserId) return null;

    const result = await query(
      `INSERT INTO assignment_history (tenant_id, contact_id, from_user_id, to_user_id, changed_by, reason)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [tenantId, contactId, fromUserId || null, toUserId || null, changedBy || null, reason || null],
    );

    await recordAudit({
      tenantId,
      actorUserId: changedBy,
      action: 'contact.assigned',
      entityType: 'contact',
      entityId: contactId,
      metadata: {
        fromUserId: fromUserId || null,
        toUserId: toUserId || null,
        reason: reason || '',
      },
    });

    return result.rows[0];
  }

  return {
    recordAudit,
    recordAssignmentHistory,
  };
}

module.exports = {
  createAuditService,
};