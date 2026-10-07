-- Service charge only for comandas opened as a table or a named comanda (review of tela Vender stage 2)
ALTER TABLE "order_sessions" ADD COLUMN "serviceChargeEligible" BOOLEAN NOT NULL DEFAULT false;
-- Open table comandas at deploy time keep the charge
UPDATE "order_sessions" SET "serviceChargeEligible" = true
WHERE "status" IN ('OPEN', 'SENT_TO_KITCHEN', 'READY') AND ("tableId" IS NOT NULL OR "tableNumber" IS NOT NULL);
