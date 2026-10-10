-- Pay at the table, stage 1 (spec 2026-10-10): online payments count on the bill of their comanda
-- Idempotent: it is run by hand BEFORE the new code is deployed (the old code ignores the new columns) and
-- again by `prisma migrate deploy` afterwards, which then only records it.
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "orderSessionId" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "cashSessionId" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "tableShareMode" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "appliedToBillAt" TIMESTAMP(3);
ALTER TABLE "order_sessions" ADD COLUMN IF NOT EXISTS "payAtWaiterRequestedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "payments_orderSessionId_idx" ON "payments"("orderSessionId");
CREATE INDEX IF NOT EXISTS "payments_cashSessionId_idx" ON "payments"("cashSessionId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_orderSessionId_fkey') THEN
    ALTER TABLE "payments" ADD CONSTRAINT "payments_orderSessionId_fkey" FOREIGN KEY ("orderSessionId") REFERENCES "order_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_cashSessionId_fkey') THEN
    ALTER TABLE "payments" ADD CONSTRAINT "payments_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Table PIX made before this change stay unlinked (their bills were closed by hand with cash-register
-- payments): no backfill, so nothing old is counted twice
