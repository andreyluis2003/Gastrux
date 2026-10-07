-- Bill (tela Vender, etapa 2): service charge and pre-bill
ALTER TABLE "restaurants" ADD COLUMN "serviceChargePercent" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "order_sessions" ADD COLUMN "serviceChargeCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "order_sessions" ADD COLUMN "serviceChargeWaived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "order_sessions" ADD COLUMN "preBillPrintedAt" TIMESTAMP(3);
