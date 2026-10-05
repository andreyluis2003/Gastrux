-- Cash sessions (spec docs/superpowers/specs/2026-10-04-caixa-turnos-design.md)
-- BEFORE deploying, run in production and keep the numbers in the deploy notes:
--   SELECT count(*) FROM cash_movements;      -- expected 0 (no screen ever created rows)
--   SELECT count(*) FROM cash_transactions;   -- expected 0
--   SELECT count(*) FROM cash_registers;      -- registers that will be kept and named

CREATE TYPE "CashSessionStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "CashEntryType" AS ENUM ('RECEIPT', 'CHANGE', 'WITHDRAWAL', 'SUPPLY', 'EXPENSE', 'REFUND', 'ADJUSTMENT');
CREATE TYPE "CashMethod" AS ENUM ('CASH', 'PIX', 'CREDIT', 'DEBIT', 'OTHER');
CREATE TYPE "CashDirection" AS ENUM ('IN', 'OUT');

ALTER TABLE "cash_registers" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "cash_sessions" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "cashRegisterId" TEXT NOT NULL,
  "status" "CashSessionStatus" NOT NULL DEFAULT 'OPEN',
  "openedById" TEXT NOT NULL,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "openingFloatCents" INTEGER NOT NULL DEFAULT 0,
  "closedById" TEXT,
  "closedAt" TIMESTAMP(3),
  "countedCents" JSONB,
  "expectedCents" JSONB,
  "differenceCents" JSONB,
  "closingNotes" TEXT,
  "lateEntries" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cash_sessions_restaurantId_idx" ON "cash_sessions"("restaurantId");
CREATE INDEX "cash_sessions_cashRegisterId_idx" ON "cash_sessions"("cashRegisterId");
CREATE INDEX "cash_sessions_openedAt_idx" ON "cash_sessions"("openedAt");
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "cash_registers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- One open shift per register (Prisma cannot express a partial index)
CREATE UNIQUE INDEX "cash_sessions_one_open_per_register" ON "cash_sessions"("cashRegisterId") WHERE "status" = 'OPEN';

CREATE TABLE "cash_session_entries" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "cashSessionId" TEXT NOT NULL,
  "type" "CashEntryType" NOT NULL,
  "method" "CashMethod" NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "direction" "CashDirection",
  "category" TEXT,
  "description" TEXT,
  "orderSessionId" TEXT,
  "createdById" TEXT NOT NULL,
  "afterClose" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cash_session_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cash_session_entries_amount_positive" CHECK ("amountCents" > 0)
);
CREATE INDEX "cash_session_entries_cashSessionId_idx" ON "cash_session_entries"("cashSessionId");
CREATE INDEX "cash_session_entries_restaurantId_idx" ON "cash_session_entries"("restaurantId");
CREATE INDEX "cash_session_entries_orderSessionId_idx" ON "cash_session_entries"("orderSessionId");
ALTER TABLE "cash_session_entries" ADD CONSTRAINT "cash_session_entries_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Registers without a restaurant cannot be used (no screen ever created them)
UPDATE "cash_registers" SET "active" = false WHERE "restaurantId" IS NULL;
-- The oldest active register of each restaurant becomes its default
UPDATE "cash_registers" r SET "isDefault" = true
FROM (SELECT DISTINCT ON ("restaurantId") "id" FROM "cash_registers" WHERE "restaurantId" IS NOT NULL AND "active" = true ORDER BY "restaurantId", "createdAt") d
WHERE r."id" = d."id";
-- Every restaurant without one gets "Caixa principal"
INSERT INTO "cash_registers" ("id", "name", "active", "isDefault", "restaurantId", "createdAt", "updatedAt")
SELECT 'cr_' || md5(random()::text || r."id"), 'Caixa principal', true, true, r."id", now(), now()
FROM "restaurants" r
WHERE NOT EXISTS (SELECT 1 FROM "cash_registers" c WHERE c."restaurantId" = r."id" AND c."active" = true);
