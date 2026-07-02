-- CreateEnum
CREATE TYPE "PaymentProofStatus" AS ENUM ('NOT_REQUIRED', 'PENDING_PROOF', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED');

-- AlterTable
ALTER TABLE "tenant_subscriptions" ADD COLUMN     "paymentAdminNote" TEXT,
ADD COLUMN     "paymentAmountPaise" INTEGER,
ADD COLUMN     "paymentPayerName" TEXT,
ADD COLUMN     "paymentProofNote" TEXT,
ADD COLUMN     "paymentProofStatus" "PaymentProofStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
ADD COLUMN     "paymentReference" TEXT,
ADD COLUMN     "paymentRejectedAt" TIMESTAMP(3),
ADD COLUMN     "paymentSubmittedAt" TIMESTAMP(3),
ADD COLUMN     "paymentVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "paymentVerifiedByUserId" TEXT;

-- CreateIndex
CREATE INDEX "tenant_subscriptions_paymentProofStatus_idx" ON "tenant_subscriptions"("paymentProofStatus");
