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

    CONSTRAINT "ninetynine_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ninetynine_events_processedAt_receivedAt_idx" ON "ninetynine_events"("processedAt", "receivedAt");
