BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "tenant_meta_accounts"
    GROUP BY "phoneNumberId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce Meta phone ownership: duplicate phoneNumberId values exist';
  END IF;
END
$$;

ALTER TABLE "tenant_meta_accounts"
ADD CONSTRAINT "tenant_meta_accounts_phoneNumberId_key"
UNIQUE ("phoneNumberId");

ALTER TABLE "tenant_meta_accounts"
DROP CONSTRAINT "tenant_meta_accounts_tenantId_phoneNumberId_key";

COMMIT;