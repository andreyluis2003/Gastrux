-- Referral program (plan 2026-10-24 indicacao, Task 2)
-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('TRIAL', 'CONFIRMING', 'EARNED', 'APPLIED', 'CANCELLED');

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "referralCode" TEXT;

-- CreateTable
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "referrerRestaurantId" TEXT NOT NULL,
    "referredRestaurantId" TEXT NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'TRIAL',
    "gateway" TEXT,
    "firstChargeRef" TEXT,
    "firstChargeAt" TIMESTAMP(3),
    "earnedAt" TIMESTAMP(3),
    "amountCents" INTEGER,
    "appliedAt" TIMESTAMP(3),
    "appliedRef" TEXT,
    "resumeAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "referrals_referredRestaurantId_key" ON "referrals"("referredRestaurantId");

-- CreateIndex
CREATE INDEX "referrals_referrerRestaurantId_status_idx" ON "referrals"("referrerRestaurantId", "status");

-- CreateIndex
CREATE INDEX "referrals_status_idx" ON "referrals"("status");

-- CreateIndex
CREATE UNIQUE INDEX "restaurants_referralCode_key" ON "restaurants"("referralCode");

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrerRestaurantId_fkey" FOREIGN KEY ("referrerRestaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referredRestaurantId_fkey" FOREIGN KEY ("referredRestaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

