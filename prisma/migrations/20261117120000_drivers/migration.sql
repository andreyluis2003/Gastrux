-- Entregadores com diária e valor por entrega (spec 2026-11-17)
CREATE TABLE "drivers" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "dailyRateCents" INTEGER NOT NULL DEFAULT 0,
    "perDeliveryCents" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "drivers_restaurantId_idx" ON "drivers"("restaurantId");
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "driver_payments" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "driverId" TEXT,
    "driverName" TEXT,
    "cashSessionId" TEXT NOT NULL,
    "deliverySettlementId" TEXT,
    "deliveryCount" INTEGER NOT NULL DEFAULT 0,
    "dailyCount" INTEGER NOT NULL DEFAULT 0,
    "dailyRateCents" INTEGER NOT NULL DEFAULT 0,
    "perDeliveryCents" INTEGER NOT NULL DEFAULT 0,
    "suggestedCents" INTEGER NOT NULL DEFAULT 0,
    "paidCents" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "driver_payments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "driver_payments_restaurantId_createdAt_idx" ON "driver_payments"("restaurantId", "createdAt");
CREATE INDEX "driver_payments_driverId_idx" ON "driver_payments"("driverId");
CREATE INDEX "driver_payments_cashSessionId_idx" ON "driver_payments"("cashSessionId");
CREATE INDEX "driver_payments_deliverySettlementId_idx" ON "driver_payments"("deliverySettlementId");
ALTER TABLE "driver_payments" ADD CONSTRAINT "driver_payments_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "driver_payments" ADD CONSTRAINT "driver_payments_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "driver_payments" ADD CONSTRAINT "driver_payments_deliverySettlementId_fkey" FOREIGN KEY ("deliverySettlementId") REFERENCES "delivery_settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- One daily rate per driver and work day: the database refuses paying the same day twice
CREATE TABLE "driver_paid_days" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "workDay" TEXT NOT NULL,
    "driverPaymentId" TEXT NOT NULL,
    CONSTRAINT "driver_paid_days_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "driver_paid_days_driverId_workDay_key" ON "driver_paid_days"("driverId", "workDay");
CREATE INDEX "driver_paid_days_driverPaymentId_idx" ON "driver_paid_days"("driverPaymentId");
ALTER TABLE "driver_paid_days" ADD CONSTRAINT "driver_paid_days_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "driver_paid_days" ADD CONSTRAINT "driver_paid_days_driverPaymentId_fkey" FOREIGN KEY ("driverPaymentId") REFERENCES "driver_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "external_orders" ADD COLUMN "driverId" TEXT, ADD COLUMN "dispatchedAt" TIMESTAMP(3), ADD COLUMN "driverPaymentId" TEXT;
CREATE INDEX "external_orders_driverId_idx" ON "external_orders"("driverId");
CREATE INDEX "external_orders_driverPaymentId_idx" ON "external_orders"("driverPaymentId");
ALTER TABLE "external_orders" ADD CONSTRAINT "external_orders_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "external_orders" ADD CONSTRAINT "external_orders_driverPaymentId_fkey" FOREIGN KEY ("driverPaymentId") REFERENCES "driver_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "order_sessions" ADD COLUMN "driverId" TEXT, ADD COLUMN "dispatchedAt" TIMESTAMP(3), ADD COLUMN "driverPaymentId" TEXT;
CREATE INDEX "order_sessions_driverId_idx" ON "order_sessions"("driverId");
CREATE INDEX "order_sessions_driverPaymentId_idx" ON "order_sessions"("driverPaymentId");
ALTER TABLE "order_sessions" ADD CONSTRAINT "order_sessions_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "order_sessions" ADD CONSTRAINT "order_sessions_driverPaymentId_fkey" FOREIGN KEY ("driverPaymentId") REFERENCES "driver_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
