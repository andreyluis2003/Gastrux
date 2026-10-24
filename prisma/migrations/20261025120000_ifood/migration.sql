-- iFood Merchant API (plan 2026-10-24 ifood)
ALTER TABLE "delivery_integrations" ADD COLUMN "oauthAccessToken" TEXT;
ALTER TABLE "delivery_integrations" ADD COLUMN "oauthRefreshToken" TEXT;
ALTER TABLE "delivery_integrations" ADD COLUMN "oauthExpiresAt" TIMESTAMP(3);
ALTER TABLE "delivery_integrations" ADD COLUMN "oauthVerifier" TEXT;
ALTER TABLE "delivery_integrations" ADD COLUMN "lastPolledAt" TIMESTAMP(3);

ALTER TABLE "external_orders" ADD COLUMN "platformData" JSONB;
ALTER TABLE "external_orders" ADD COLUMN "platformConfirmedAt" TIMESTAMP(3);
ALTER TABLE "external_orders" ADD COLUMN "disputeId" TEXT;
ALTER TABLE "external_orders" ADD COLUMN "disputeExpiresAt" TIMESTAMP(3);

CREATE TABLE "ifood_events" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT,
    "merchantId" TEXT NOT NULL,
    "orderId" TEXT,
    "code" TEXT NOT NULL,
    "fullCode" TEXT,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    CONSTRAINT "ifood_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ifood_events_processedAt_idx" ON "ifood_events"("processedAt");
