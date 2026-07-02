ALTER TABLE "campaigns"
ADD COLUMN "scheduledAt" TIMESTAMP(3),
ADD COLUMN "lastError" TEXT;

CREATE INDEX "campaigns_tenantId_status_scheduledAt_idx"
ON "campaigns"("tenantId", "status", "scheduledAt");