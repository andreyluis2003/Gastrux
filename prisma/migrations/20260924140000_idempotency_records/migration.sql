-- Offline queue replays: one row per Idempotency-Key and restaurant (lib/api/idempotency.ts).
CREATE TABLE "idempotency_records" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL DEFAULT 0,
    "responseBody" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "idempotency_records_restaurantId_key_key" ON "idempotency_records"("restaurantId", "key");
CREATE INDEX "idempotency_records_createdAt_idx" ON "idempotency_records"("createdAt");
