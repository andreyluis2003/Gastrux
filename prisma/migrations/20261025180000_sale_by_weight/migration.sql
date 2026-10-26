-- Venda por peso (spec 2026-10-25 venda-por-peso)
ALTER TABLE "menu_items" ADD COLUMN "soldByWeight" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "order_session_items" ADD COLUMN "weightGrams" INTEGER, ADD COLUMN "pricePerKg" DECIMAL(65,30);
ALTER TABLE "order_items" ADD COLUMN "weightGrams" INTEGER;
