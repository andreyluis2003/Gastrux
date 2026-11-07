-- Cardápio rápido (spec 2026-11-06): weekdays an item is offered to customers; empty = every day.
-- IF NOT EXISTS: the column is added in the old container BEFORE the Deploy (every MenuItem query reads it).
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "availableDays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
