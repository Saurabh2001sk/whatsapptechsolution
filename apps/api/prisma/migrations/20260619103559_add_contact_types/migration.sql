-- CreateTable
CREATE TABLE "contact_types" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_types_tenantId_idx" ON "contact_types"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "contact_types_tenantId_name_key" ON "contact_types"("tenantId", "name");

-- AddForeignKey
ALTER TABLE "contact_types" ADD CONSTRAINT "contact_types_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
