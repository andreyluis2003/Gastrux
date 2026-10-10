-- Pay at the table, stage 1 (spec 2026-10-10): online payments count on the bill of their comanda
ALTER TABLE "payments" ADD COLUMN "orderSessionId" TEXT;
ALTER TABLE "payments" ADD COLUMN "cashSessionId" TEXT;
ALTER TABLE "payments" ADD COLUMN "tableShareMode" TEXT;
ALTER TABLE "payments" ADD COLUMN "appliedToBillAt" TIMESTAMP(3);
ALTER TABLE "order_sessions" ADD COLUMN "payAtWaiterRequestedAt" TIMESTAMP(3);
CREATE INDEX "payments_orderSessionId_idx" ON "payments"("orderSessionId");
CREATE INDEX "payments_cashSessionId_idx" ON "payments"("cashSessionId");
ALTER TABLE "payments" ADD CONSTRAINT "payments_orderSessionId_fkey" FOREIGN KEY ("orderSessionId") REFERENCES "order_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Table PIX made before this change stay unlinked (their bills were closed by hand with cash-register
-- payments): no backfill, so nothing old is counted twice
