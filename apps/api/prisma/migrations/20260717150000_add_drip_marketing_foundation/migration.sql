CREATE TABLE "drip_workflows" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "targetContactTypeId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "audienceType" TEXT NOT NULL DEFAULT 'ALL_OPTED_IN',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "sendingStartTime" TEXT NOT NULL DEFAULT '09:00',
    "sendingEndTime" TEXT NOT NULL DEFAULT '19:00',
    "sendingDays" INTEGER[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6]::INTEGER[],
    "autoEnrollNewContacts" BOOLEAN NOT NULL DEFAULT true,
    "autoEnrollInbound" BOOLEAN NOT NULL DEFAULT true,
    "includeExistingContacts" BOOLEAN NOT NULL DEFAULT false,
    "allowReentry" BOOLEAN NOT NULL DEFAULT false,
    "reentryCooldownDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "activatedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "drip_workflows_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "drip_steps" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dayOffset" INTEGER NOT NULL,
    "minuteOffset" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL,
    "variableValues" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "drip_steps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "drip_enrollments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "source" TEXT NOT NULL,
    "currentStepPosition" INTEGER NOT NULL DEFAULT 0,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextRunAt" TIMESTAMP(3),
    "lastProcessedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "stoppedAt" TIMESTAMP(3),
    "stopReason" TEXT,
    "entryCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "drip_enrollments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "drip_messages" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "metaMessageId" TEXT,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "statusWebhookAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "drip_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "drip_audit_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workflowId" TEXT,
    "contactId" TEXT,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "drip_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "drip_workflows_tenantId_idx" ON "drip_workflows"("tenantId");
CREATE INDEX "drip_workflows_tenantId_status_idx" ON "drip_workflows"("tenantId", "status");
CREATE INDEX "drip_workflows_tenantId_targetContactTypeId_idx" ON "drip_workflows"("tenantId", "targetContactTypeId");
CREATE INDEX "drip_steps_tenantId_idx" ON "drip_steps"("tenantId");
CREATE INDEX "drip_steps_tenantId_workflowId_idx" ON "drip_steps"("tenantId", "workflowId");
CREATE INDEX "drip_steps_templateId_idx" ON "drip_steps"("templateId");
CREATE UNIQUE INDEX "drip_steps_workflowId_position_key" ON "drip_steps"("workflowId", "position");
CREATE INDEX "drip_enrollments_tenantId_idx" ON "drip_enrollments"("tenantId");
CREATE INDEX "drip_enrollments_tenantId_status_idx" ON "drip_enrollments"("tenantId", "status");
CREATE INDEX "drip_enrollments_tenantId_nextRunAt_idx" ON "drip_enrollments"("tenantId", "nextRunAt");
CREATE INDEX "drip_enrollments_workflowId_idx" ON "drip_enrollments"("workflowId");
CREATE INDEX "drip_enrollments_contactId_idx" ON "drip_enrollments"("contactId");
CREATE UNIQUE INDEX "drip_enrollments_workflowId_contactId_key" ON "drip_enrollments"("workflowId", "contactId");
CREATE INDEX "drip_messages_tenantId_idx" ON "drip_messages"("tenantId");
CREATE INDEX "drip_messages_tenantId_status_idx" ON "drip_messages"("tenantId", "status");
CREATE INDEX "drip_messages_tenantId_scheduledFor_idx" ON "drip_messages"("tenantId", "scheduledFor");
CREATE INDEX "drip_messages_workflowId_idx" ON "drip_messages"("workflowId");
CREATE INDEX "drip_messages_contactId_idx" ON "drip_messages"("contactId");
CREATE INDEX "drip_messages_metaMessageId_idx" ON "drip_messages"("metaMessageId");
CREATE UNIQUE INDEX "drip_messages_enrollmentId_stepId_key" ON "drip_messages"("enrollmentId", "stepId");
CREATE INDEX "drip_audit_logs_tenantId_idx" ON "drip_audit_logs"("tenantId");
CREATE INDEX "drip_audit_logs_tenantId_workflowId_idx" ON "drip_audit_logs"("tenantId", "workflowId");
CREATE INDEX "drip_audit_logs_tenantId_contactId_idx" ON "drip_audit_logs"("tenantId", "contactId");
CREATE INDEX "drip_audit_logs_tenantId_action_idx" ON "drip_audit_logs"("tenantId", "action");
CREATE INDEX "drip_audit_logs_actorUserId_idx" ON "drip_audit_logs"("actorUserId");

ALTER TABLE "drip_workflows" ADD CONSTRAINT "drip_workflows_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "drip_workflows" ADD CONSTRAINT "drip_workflows_targetContactTypeId_fkey" FOREIGN KEY ("targetContactTypeId") REFERENCES "contact_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "drip_steps" ADD CONSTRAINT "drip_steps_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "drip_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "drip_steps" ADD CONSTRAINT "drip_steps_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "whatsapp_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "drip_enrollments" ADD CONSTRAINT "drip_enrollments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "drip_enrollments" ADD CONSTRAINT "drip_enrollments_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "drip_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "drip_enrollments" ADD CONSTRAINT "drip_enrollments_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "drip_messages" ADD CONSTRAINT "drip_messages_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "drip_messages" ADD CONSTRAINT "drip_messages_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "drip_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "drip_messages" ADD CONSTRAINT "drip_messages_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "drip_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "drip_messages" ADD CONSTRAINT "drip_messages_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "drip_steps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "drip_messages" ADD CONSTRAINT "drip_messages_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "drip_audit_logs" ADD CONSTRAINT "drip_audit_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "drip_audit_logs" ADD CONSTRAINT "drip_audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
