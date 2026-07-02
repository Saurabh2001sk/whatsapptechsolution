-- AlterTable
ALTER TABLE "users" ADD COLUMN     "twoFactorConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "twoFactorLastUsedAt" TIMESTAMP(3),
ADD COLUMN     "twoFactorSecretEncrypted" TEXT;

-- CreateTable
CREATE TABLE "two_factor_login_challenges" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "two_factor_login_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "two_factor_login_challenges_tokenHash_key" ON "two_factor_login_challenges"("tokenHash");

-- CreateIndex
CREATE INDEX "two_factor_login_challenges_userId_idx" ON "two_factor_login_challenges"("userId");

-- CreateIndex
CREATE INDEX "two_factor_login_challenges_expiresAt_idx" ON "two_factor_login_challenges"("expiresAt");

-- AddForeignKey
ALTER TABLE "two_factor_login_challenges" ADD CONSTRAINT "two_factor_login_challenges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
