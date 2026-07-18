ALTER TABLE "drip_enrollments"
ADD COLUMN IF NOT EXISTS "enrollmentCycle" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "drip_steps"
ADD COLUMN IF NOT EXISTS "metaHeaderMediaId" TEXT;

ALTER TABLE "drip_steps"
ADD COLUMN IF NOT EXISTS "metaHeaderMediaUploadedAt" TIMESTAMP(3);

ALTER TABLE "drip_workflows"
ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

ALTER TABLE "drip_enrollments"
DROP CONSTRAINT IF EXISTS "drip_enrollments_workflowId_contactId_key";

DROP INDEX IF EXISTS "drip_enrollments_workflowId_contactId_key";

CREATE UNIQUE INDEX IF NOT EXISTS
"drip_enrollments_workflowId_contactId_enrollmentCycle_key"
ON "drip_enrollments"(
  "workflowId",
  "contactId",
  "enrollmentCycle"
);

CREATE INDEX IF NOT EXISTS
"drip_enrollments_tenantId_workflowId_contactId_status_idx"
ON "drip_enrollments"(
  "tenantId",
  "workflowId",
  "contactId",
  "status"
);