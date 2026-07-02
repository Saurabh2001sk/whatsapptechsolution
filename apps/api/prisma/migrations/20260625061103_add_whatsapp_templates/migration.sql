-- CreateTable
CREATE TABLE "tenant_meta_accounts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "wabaId" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "businessName" TEXT,
    "encryptedAccessToken" TEXT NOT NULL,
    "tokenLastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_meta_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "metaTemplateId" TEXT,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "headerType" TEXT,
    "headerText" TEXT,
    "bodyText" TEXT NOT NULL,
    "footerText" TEXT,
    "buttons" JSONB,
    "components" JSONB NOT NULL,
    "variableCount" INTEGER NOT NULL DEFAULT 0,
    "qualityScore" TEXT,
    "rejectedReason" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenant_meta_accounts_tenantId_idx" ON "tenant_meta_accounts"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_meta_accounts_tenantId_wabaId_key" ON "tenant_meta_accounts"("tenantId", "wabaId");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_meta_accounts_tenantId_phoneNumberId_key" ON "tenant_meta_accounts"("tenantId", "phoneNumberId");

-- CreateIndex
CREATE INDEX "whatsapp_templates_tenantId_idx" ON "whatsapp_templates"("tenantId");

-- CreateIndex
CREATE INDEX "whatsapp_templates_tenantId_status_idx" ON "whatsapp_templates"("tenantId", "status");

-- CreateIndex
CREATE INDEX "whatsapp_templates_tenantId_category_idx" ON "whatsapp_templates"("tenantId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_templates_tenantId_name_language_key" ON "whatsapp_templates"("tenantId", "name", "language");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_templates_tenantId_metaTemplateId_key" ON "whatsapp_templates"("tenantId", "metaTemplateId");

-- AddForeignKey
ALTER TABLE "tenant_meta_accounts" ADD CONSTRAINT "tenant_meta_accounts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
