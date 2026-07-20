CREATE TABLE "conversations" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "contactId" TEXT,
  "metaAccountId" TEXT NOT NULL,
  "customerPhone" TEXT NOT NULL,
  "assignedUserId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "unreadCount" INTEGER NOT NULL DEFAULT 0,
  "lastMessagePreview" TEXT,
  "lastMessageAt" TIMESTAMP(3),
  "lastInboundAt" TIMESTAMP(3),
  "lastOutboundAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whatsapp_messages" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "contactId" TEXT,
  "customerPhone" TEXT NOT NULL,
  "webhookEventId" TEXT,
  "mediaFileId" TEXT,
  "sentByUserId" TEXT,
  "metaMessageId" TEXT,
  "idempotencyKey" TEXT,
  "direction" TEXT NOT NULL,
  "messageType" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "bodyText" TEXT,
  "caption" TEXT,
  "replyToMetaMessageId" TEXT,
  "rawPayload" JSONB,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "conversation_assignments" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "assignedUserId" TEXT,
  "assignedByUserId" TEXT,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "unassignedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "conversation_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "conversations_tenantId_customerPhone_metaAccountId_key"
  ON "conversations"("tenantId", "customerPhone", "metaAccountId");

CREATE INDEX "conversations_tenantId_status_lastMessageAt_idx"
  ON "conversations"("tenantId", "status", "lastMessageAt");

CREATE INDEX "conversations_tenantId_assignedUserId_status_idx"
  ON "conversations"("tenantId", "assignedUserId", "status");

CREATE INDEX "conversations_tenantId_contactId_idx"
  ON "conversations"("tenantId", "contactId");

CREATE UNIQUE INDEX "whatsapp_messages_metaMessageId_key"
  ON "whatsapp_messages"("metaMessageId");

CREATE UNIQUE INDEX "whatsapp_messages_tenantId_idempotencyKey_key"
  ON "whatsapp_messages"("tenantId", "idempotencyKey");

CREATE INDEX "whatsapp_messages_tenantId_conversationId_occurredAt_idx"
  ON "whatsapp_messages"("tenantId", "conversationId", "occurredAt");

CREATE INDEX "whatsapp_messages_tenantId_customerPhone_occurredAt_idx"
  ON "whatsapp_messages"("tenantId", "customerPhone", "occurredAt");

CREATE INDEX "whatsapp_messages_tenantId_contactId_occurredAt_idx"
  ON "whatsapp_messages"("tenantId", "contactId", "occurredAt");

CREATE INDEX "whatsapp_messages_tenantId_status_idx"
  ON "whatsapp_messages"("tenantId", "status");

CREATE INDEX "whatsapp_messages_webhookEventId_idx"
  ON "whatsapp_messages"("webhookEventId");

CREATE INDEX "conversation_assignments_tenantId_conversationId_assignedAt_idx"
  ON "conversation_assignments"("tenantId", "conversationId", "assignedAt");

CREATE INDEX "conversation_assignments_tenantId_assignedUserId_unassignedAt_idx"
  ON "conversation_assignments"("tenantId", "assignedUserId", "unassignedAt");

ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_tenantId_fkey"
  FOREIGN KEY ("tenantId")
  REFERENCES "tenants"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_contactId_fkey"
  FOREIGN KEY ("contactId")
  REFERENCES "contacts"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_metaAccountId_fkey"
  FOREIGN KEY ("metaAccountId")
  REFERENCES "tenant_meta_accounts"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_assignedUserId_fkey"
  FOREIGN KEY ("assignedUserId")
  REFERENCES "users"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "whatsapp_messages"
  ADD CONSTRAINT "whatsapp_messages_tenantId_fkey"
  FOREIGN KEY ("tenantId")
  REFERENCES "tenants"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "whatsapp_messages"
  ADD CONSTRAINT "whatsapp_messages_conversationId_fkey"
  FOREIGN KEY ("conversationId")
  REFERENCES "conversations"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "whatsapp_messages"
  ADD CONSTRAINT "whatsapp_messages_contactId_fkey"
  FOREIGN KEY ("contactId")
  REFERENCES "contacts"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "whatsapp_messages"
  ADD CONSTRAINT "whatsapp_messages_webhookEventId_fkey"
  FOREIGN KEY ("webhookEventId")
  REFERENCES "webhook_events"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "whatsapp_messages"
  ADD CONSTRAINT "whatsapp_messages_mediaFileId_fkey"
  FOREIGN KEY ("mediaFileId")
  REFERENCES "media_files"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "whatsapp_messages"
  ADD CONSTRAINT "whatsapp_messages_sentByUserId_fkey"
  FOREIGN KEY ("sentByUserId")
  REFERENCES "users"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "conversation_assignments"
  ADD CONSTRAINT "conversation_assignments_tenantId_fkey"
  FOREIGN KEY ("tenantId")
  REFERENCES "tenants"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "conversation_assignments"
  ADD CONSTRAINT "conversation_assignments_conversationId_fkey"
  FOREIGN KEY ("conversationId")
  REFERENCES "conversations"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "conversation_assignments"
  ADD CONSTRAINT "conversation_assignments_assignedUserId_fkey"
  FOREIGN KEY ("assignedUserId")
  REFERENCES "users"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "conversation_assignments"
  ADD CONSTRAINT "conversation_assignments_assignedByUserId_fkey"
  FOREIGN KEY ("assignedByUserId")
  REFERENCES "users"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;