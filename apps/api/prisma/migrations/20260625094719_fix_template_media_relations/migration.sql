/*
  Safe migration:
  - Keeps existing Contact data
  - Renames old "Contact" table to new "contacts" table
  - Adds template/media fields
*/

-- Rename old Contact table safely instead of dropping it
ALTER TABLE "Contact" RENAME TO "contacts";

-- Rename old indexes safely
ALTER INDEX IF EXISTS "Contact_tenantId_idx" RENAME TO "contacts_tenantId_idx";
ALTER INDEX IF EXISTS "Contact_contactTypeId_idx" RENAME TO "contacts_contactTypeId_idx";
ALTER INDEX IF EXISTS "Contact_tenantId_phone_key" RENAME TO "contacts_tenantId_phone_key";

-- Rename old foreign key constraints safely
ALTER TABLE "contacts" RENAME CONSTRAINT "Contact_tenantId_fkey" TO "contacts_tenantId_fkey";
ALTER TABLE "contacts" RENAME CONSTRAINT "Contact_contactTypeId_fkey" TO "contacts_contactTypeId_fkey";

-- Add Meta app id to Meta accounts
ALTER TABLE "tenant_meta_accounts" ADD COLUMN IF NOT EXISTS "metaAppId" TEXT;

-- Add header media fields to WhatsApp templates
ALTER TABLE "whatsapp_templates"
ADD COLUMN IF NOT EXISTS "headerMediaFileId" TEXT,
ADD COLUMN IF NOT EXISTS "metaHeaderHandle" TEXT;

-- Add template media index safely
CREATE INDEX IF NOT EXISTS "whatsapp_templates_headerMediaFileId_idx"
ON "whatsapp_templates"("headerMediaFileId");

-- Add template media foreign key safely
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'whatsapp_templates_headerMediaFileId_fkey'
  ) THEN
    ALTER TABLE "whatsapp_templates"
    ADD CONSTRAINT "whatsapp_templates_headerMediaFileId_fkey"
    FOREIGN KEY ("headerMediaFileId")
    REFERENCES "media_files"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END $$;