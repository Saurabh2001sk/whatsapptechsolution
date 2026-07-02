ALTER TABLE "tenant_meta_accounts"
ADD COLUMN "qualityRating" TEXT,
ADD COLUMN "messagingLimitTier" TEXT,
ADD COLUMN "qualitySyncedAt" TIMESTAMP(3);

ALTER TABLE "campaigns"
ADD COLUMN "canceledAt" TIMESTAMP(3);

ALTER TABLE "campaign_recipients"
ADD COLUMN "deliveredAt" TIMESTAMP(3),
ADD COLUMN "readAt" TIMESTAMP(3),
ADD COLUMN "failedAt" TIMESTAMP(3),
ADD COLUMN "statusWebhookAt" TIMESTAMP(3);

CREATE INDEX "campaign_recipients_metaMessageId_idx"
ON "campaign_recipients"("metaMessageId");