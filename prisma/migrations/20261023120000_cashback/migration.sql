-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "phoneDigits" TEXT,
ALTER COLUMN "email" DROP NOT NULL;

-- AlterTable
ALTER TABLE "order_sessions" ADD COLUMN     "cashbackUsedCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "customerId" TEXT;

-- CreateTable
CREATE TABLE "cashback_settings" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "percent" DECIMAL(5,2) NOT NULL DEFAULT 5,
    "validityMonths" INTEGER NOT NULL DEFAULT 6,
    "minUseCents" INTEGER NOT NULL DEFAULT 1000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cashback_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cashback_credits" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderSessionId" TEXT,
    "orderId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "remainingCents" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "reversedSessionId" TEXT,
    "reversedOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cashback_credits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cashback_uses" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderSessionId" TEXT,
    "reversedSessionId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "allocations" JSONB NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cashback_uses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cashback_settings_restaurantId_key" ON "cashback_settings"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "cashback_credits_orderSessionId_key" ON "cashback_credits"("orderSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "cashback_credits_orderId_key" ON "cashback_credits"("orderId");

-- CreateIndex
CREATE INDEX "cashback_credits_restaurantId_customerId_idx" ON "cashback_credits"("restaurantId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "cashback_uses_orderSessionId_key" ON "cashback_uses"("orderSessionId");

-- CreateIndex
CREATE INDEX "cashback_uses_restaurantId_customerId_idx" ON "cashback_uses"("restaurantId", "customerId");

-- Backfill (spec 2026-10-23 §6): phoneDigits from phone, DDD + number (a leading 55 dropped); when two customers
-- of a restaurant share a phone, only the most recent one gets it
WITH digits AS (
  SELECT id, "restaurantId", "createdAt",
         CASE WHEN length(d) IN (12, 13) AND left(d, 2) = '55' THEN substr(d, 3) ELSE d END AS d
  FROM (SELECT id, "restaurantId", "createdAt", regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') AS d FROM "customers") raw
), ranked AS (
  SELECT id, d, ROW_NUMBER() OVER (PARTITION BY "restaurantId", d ORDER BY "createdAt" DESC) AS rn
  FROM digits WHERE length(d) IN (10, 11)
)
UPDATE "customers" c SET "phoneDigits" = ranked.d FROM ranked WHERE ranked.id = c.id AND ranked.rn = 1;

-- CreateIndex
CREATE UNIQUE INDEX "customers_restaurantId_phoneDigits_key" ON "customers"("restaurantId", "phoneDigits");

-- AddForeignKey
ALTER TABLE "order_sessions" ADD CONSTRAINT "order_sessions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashback_credits" ADD CONSTRAINT "cashback_credits_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashback_uses" ADD CONSTRAINT "cashback_uses_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

