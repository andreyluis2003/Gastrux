-- Commission periods (2026-10-06): week and month views on screen, and closing for payment by the
-- restaurant's pay period (weekly, biweekly or monthly; monthly by default). Only adds columns and
-- swaps one unique index: no row is changed or removed. Today no code creates staff_commissions rows.
CREATE TYPE "CommissionPeriod" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY');

ALTER TABLE "restaurants" ADD COLUMN "commissionPayPeriod" "CommissionPeriod" NOT NULL DEFAULT 'MONTHLY';

ALTER TABLE "staff_commissions"
  ADD COLUMN "periodType" "CommissionPeriod" NOT NULL DEFAULT 'MONTHLY',
  ADD COLUMN "periodEnd" DATE,
  ADD COLUMN "billsCount" INTEGER NOT NULL DEFAULT 0;

-- A week and a month can start on the same day: the period type is part of the key
DROP INDEX IF EXISTS "staff_commissions_staffMemberId_period_key";
CREATE UNIQUE INDEX "staff_commissions_staffMemberId_periodType_period_key" ON "staff_commissions"("staffMemberId", "periodType", "period");
