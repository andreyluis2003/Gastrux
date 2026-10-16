-- Contas de consumo (spec 2026-10-16)
CREATE TYPE "UtilityKind" AS ENUM ('ENERGY', 'WATER', 'PIPED_GAS', 'BOTTLED_GAS', 'PHONE_INTERNET', 'OTHER');

CREATE TABLE "utility_accounts" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "kind" "UtilityKind" NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "utility_accounts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "utility_accounts_restaurantId_idx" ON "utility_accounts"("restaurantId");
ALTER TABLE "utility_accounts" ADD CONSTRAINT "utility_accounts_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "utility_bills" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "referenceMonth" DATE NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "consumption" DECIMAL(12,3),
    "dueDate" DATE,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "utility_bills_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "utility_bills_accountId_referenceMonth_key" ON "utility_bills"("accountId", "referenceMonth");
CREATE INDEX "utility_bills_restaurantId_referenceMonth_idx" ON "utility_bills"("restaurantId", "referenceMonth");
ALTER TABLE "utility_bills" ADD CONSTRAINT "utility_bills_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "utility_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "utility_bills" ADD CONSTRAINT "utility_bills_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "utility_bills" ADD CONSTRAINT "utility_bills_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "utility_bills" ADD CONSTRAINT "utility_bills_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
