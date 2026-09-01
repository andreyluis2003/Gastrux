-- CashFlowRecord, FinancialMetric, and FinancialForecast had no restaurantId
-- at all since these tables were created - every restaurant's cash flow
-- records, financial metrics, and forecasts were mixed together in one
-- global pool, readable/writable by any authenticated user regardless of
-- which restaurant they belonged to. There has only ever been one real
-- restaurant in production, so backfilling every existing row to it is safe
-- and unambiguous.

-- CashFlowRecord
ALTER TABLE "cash_flow_records" ADD COLUMN "restaurantId" TEXT;
UPDATE "cash_flow_records" SET "restaurantId" = 'cmtgapwel0001jpu1k320it6r' WHERE "restaurantId" IS NULL;
ALTER TABLE "cash_flow_records" ALTER COLUMN "restaurantId" SET NOT NULL;
ALTER TABLE "cash_flow_records" ADD CONSTRAINT "cash_flow_records_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "cash_flow_records_restaurantId_idx" ON "cash_flow_records"("restaurantId");

-- FinancialMetric
ALTER TABLE "financial_metrics" ADD COLUMN "restaurantId" TEXT;
UPDATE "financial_metrics" SET "restaurantId" = 'cmtgapwel0001jpu1k320it6r' WHERE "restaurantId" IS NULL;
ALTER TABLE "financial_metrics" ALTER COLUMN "restaurantId" SET NOT NULL;
ALTER TABLE "financial_metrics" ADD CONSTRAINT "financial_metrics_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "financial_metrics_restaurantId_idx" ON "financial_metrics"("restaurantId");
DROP INDEX IF EXISTS "financial_metrics_metricType_period_date_key";
CREATE UNIQUE INDEX "financial_metrics_restaurantId_metricType_period_date_key" ON "financial_metrics"("restaurantId", "metricType", "period", "date");

-- FinancialForecast
ALTER TABLE "financial_forecasts" ADD COLUMN "restaurantId" TEXT;
UPDATE "financial_forecasts" SET "restaurantId" = 'cmtgapwel0001jpu1k320it6r' WHERE "restaurantId" IS NULL;
ALTER TABLE "financial_forecasts" ALTER COLUMN "restaurantId" SET NOT NULL;
ALTER TABLE "financial_forecasts" ADD CONSTRAINT "financial_forecasts_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "financial_forecasts_restaurantId_idx" ON "financial_forecasts"("restaurantId");

-- MetricSnapshot had no restaurantId either, and no primary key at all -
-- snapshotDate alone was globally unique per calendar day across every
-- restaurant on the platform. Gives it a real primary key
-- (restaurantId, snapshotDate) that also expresses the intended business key.
ALTER TABLE "metric_snapshots" ADD COLUMN "restaurantId" TEXT;
UPDATE "metric_snapshots" SET "restaurantId" = 'cmtgapwel0001jpu1k320it6r' WHERE "restaurantId" IS NULL;
ALTER TABLE "metric_snapshots" ALTER COLUMN "restaurantId" SET NOT NULL;
DROP INDEX IF EXISTS "metric_snapshots_snapshotDate_key";
ALTER TABLE "metric_snapshots" ADD CONSTRAINT "metric_snapshots_pkey" PRIMARY KEY ("restaurantId", "snapshotDate");
ALTER TABLE "metric_snapshots" ADD CONSTRAINT "metric_snapshots_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "metric_snapshots_restaurantId_idx" ON "metric_snapshots"("restaurantId");
