-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "optInAt" TIMESTAMP(3),
ADD COLUMN     "optInSource" TEXT,
ADD COLUMN     "optOutAt" TIMESTAMP(3),
ALTER COLUMN "optedIn" SET DEFAULT false;
