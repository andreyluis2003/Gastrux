-- AlterTable
ALTER TABLE "order_sessions" ADD COLUMN "couponDiscountCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "couponCode" TEXT;

-- AlterTable
ALTER TABLE "coupon_redemptions" ADD COLUMN "orderSessionId" TEXT,
ADD COLUMN "outOfRule" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "coupon_redemptions_orderSessionId_idx" ON "coupon_redemptions"("orderSessionId");
