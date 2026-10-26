-- Encomendas (spec 2026-10-26 encomendas)
ALTER TYPE "OrderSessionStatus" ADD VALUE 'ENCOMENDA';
ALTER TABLE "order_sessions" ADD COLUMN "pickupAt" TIMESTAMP(3);
CREATE INDEX "order_sessions_restaurantId_status_pickupAt_idx" ON "order_sessions"("restaurantId", "status", "pickupAt");
