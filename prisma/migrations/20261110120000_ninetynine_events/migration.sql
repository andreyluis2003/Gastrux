-- CreateTable
CREATE TABLE "ninetynine_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "appShopId" TEXT,
    "orderId" TEXT,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "nextAttemptAt" TIMESTAMP(3),

    CONSTRAINT "ninetynine_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ninetynine_events_processedAt_receivedAt_idx" ON "ninetynine_events"("processedAt", "receivedAt");

-- CreateIndex
CREATE INDEX "ninetynine_events_processedAt_nextAttemptAt_idx" ON "ninetynine_events"("processedAt", "nextAttemptAt");

-- AlterTable: link requests the Gastrux staff confirms, and the hand pause (plan 2026-11-09 99food, Task 6)
ALTER TABLE "delivery_integrations" ADD COLUMN "linkRequestStoreId" TEXT,
ADD COLUMN "linkRequestStoreName" TEXT,
ADD COLUMN "linkRequestedAt" TIMESTAMP(3),
ADD COLUMN "linkRequestedBy" TEXT,
ADD COLUMN "pausedUntil" TIMESTAMP(3);
