-- AlterTable
ALTER TABLE "campaign_recipients" ADD COLUMN     "retryCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "campaign_audit_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaign_audit_logs_tenantId_idx" ON "campaign_audit_logs"("tenantId");

-- CreateIndex
CREATE INDEX "campaign_audit_logs_tenantId_campaignId_idx" ON "campaign_audit_logs"("tenantId", "campaignId");

-- CreateIndex
CREATE INDEX "campaign_audit_logs_tenantId_action_idx" ON "campaign_audit_logs"("tenantId", "action");

-- CreateIndex
CREATE INDEX "campaign_audit_logs_actorUserId_idx" ON "campaign_audit_logs"("actorUserId");

-- AddForeignKey
ALTER TABLE "campaign_audit_logs" ADD CONSTRAINT "campaign_audit_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_audit_logs" ADD CONSTRAINT "campaign_audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
