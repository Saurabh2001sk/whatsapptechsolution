ALTER TABLE "whatsapp_messages"
  ADD COLUMN "templateId" TEXT,
  ADD COLUMN "failureClass" TEXT,
  ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "queuedAt" TIMESTAMP(3),
  ADD COLUMN "processingStartedAt" TIMESTAMP(3),
  ADD COLUMN "nextRetryAt" TIMESTAMP(3);

CREATE INDEX "whatsapp_messages_tenantId_status_nextRetryAt_idx"
  ON "whatsapp_messages"(
    "tenantId",
    "status",
    "nextRetryAt"
  );

CREATE INDEX "whatsapp_messages_templateId_idx"
  ON "whatsapp_messages"("templateId");

ALTER TABLE "whatsapp_messages"
  ADD CONSTRAINT "whatsapp_messages_templateId_fkey"
  FOREIGN KEY ("templateId")
  REFERENCES "whatsapp_templates"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;