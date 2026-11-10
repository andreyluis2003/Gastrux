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

-- CreateTable: link requests the Gastrux staff confirms, and the hand pause (plan 2026-11-09 99food, Task 6). A table
-- apart: delivery_integrations keeps its columns, so the running app never meets a column it does not know
CREATE TABLE "ninetynine_store_states" (
    "integrationId" TEXT NOT NULL,
    "linkRequestStoreId" TEXT,
    "linkRequestStoreName" TEXT,
    "linkRequestedAt" TIMESTAMP(3),
    "linkRequestedBy" TEXT,
    "pausedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ninetynine_store_states_pkey" PRIMARY KEY ("integrationId")
);

-- AddForeignKey
ALTER TABLE "ninetynine_store_states" ADD CONSTRAINT "ninetynine_store_states_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "delivery_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
