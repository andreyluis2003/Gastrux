-- Acerto com o entregador (spec 2026-10-26)
CREATE TABLE "delivery_settlements" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "cashSessionId" TEXT NOT NULL,
    "driverName" TEXT,
    "orderCount" INTEGER NOT NULL,
    "expectedCashCents" INTEGER NOT NULL,
    "receivedCashCents" INTEGER NOT NULL,
    "creditCents" INTEGER NOT NULL DEFAULT 0,
    "debitCents" INTEGER NOT NULL DEFAULT 0,
    "otherCents" INTEGER NOT NULL DEFAULT 0,
    "driverPayCents" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "delivery_settlements_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "delivery_settlements_restaurantId_createdAt_idx" ON "delivery_settlements"("restaurantId", "createdAt");
CREATE INDEX "delivery_settlements_cashSessionId_idx" ON "delivery_settlements"("cashSessionId");
ALTER TABLE "delivery_settlements" ADD CONSTRAINT "delivery_settlements_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "external_orders" ADD COLUMN "driverName" TEXT, ADD COLUMN "settlementId" TEXT;
CREATE INDEX "external_orders_restaurantId_settlementId_idx" ON "external_orders"("restaurantId", "settlementId");
ALTER TABLE "external_orders" ADD CONSTRAINT "external_orders_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "delivery_settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "cash_session_entries" ADD COLUMN "deliverySettlementId" TEXT;
