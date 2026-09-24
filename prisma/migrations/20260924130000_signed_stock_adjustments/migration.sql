-- ADJUSTMENT movement quantities are now SIGNED (+ stock in, - stock out), so the CMV can count a
-- shortage found by a stock count. Until now every ADJUSTMENT stored a positive quantity:
-- - stock counts stored |difference| and wrote the sign only in the reason ("(dif: +3.00)" / "(dif: -3.00)");
-- - /api/stock/quick-movement and /api/stock/movement always REMOVED stock for an ADJUSTMENT.
-- So every existing positive ADJUSTMENT is a stock-out, except the count surpluses.
UPDATE "stock_movements"
SET "quantity" = -"quantity"
WHERE "movementType" = 'ADJUSTMENT'
  AND "quantity" > 0
  AND ("reason" IS NULL OR "reason" NOT LIKE 'Contagem física:%(dif: +%');
