-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "contactTypeId" TEXT;

-- CreateIndex
CREATE INDEX "Contact_contactTypeId_idx" ON "Contact"("contactTypeId");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_contactTypeId_fkey" FOREIGN KEY ("contactTypeId") REFERENCES "contact_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
