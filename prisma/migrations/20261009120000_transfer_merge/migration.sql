-- Tela Vender, etapa 3: per-line kitchen state, merge history, every kitchen order linked to its comanda
ALTER TABLE "order_session_items" ADD COLUMN "sentAt" TIMESTAMP(3);
ALTER TABLE "order_sessions" ADD COLUMN "mergedIntoId" TEXT;
ALTER TABLE "orders" ADD COLUMN "orderSessionId" TEXT;
CREATE INDEX "orders_orderSessionId_idx" ON "orders"("orderSessionId");
ALTER TABLE "orders" ADD CONSTRAINT "orders_orderSessionId_fkey" FOREIGN KEY ("orderSessionId") REFERENCES "order_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Lines the kitchen already had under the old rule (addedAt <= sentToKitchenAt)
UPDATE "order_session_items" i SET "sentAt" = s."sentToKitchenAt"
FROM "order_sessions" s
WHERE i."sessionId" = s."id" AND s."sentToKitchenAt" IS NOT NULL AND i."addedAt" <= s."sentToKitchenAt";

-- The latest kitchen order of each comanda (the only link that existed)
UPDATE "orders" o SET "orderSessionId" = s."id" FROM "order_sessions" s WHERE s."orderId" = o."id";
