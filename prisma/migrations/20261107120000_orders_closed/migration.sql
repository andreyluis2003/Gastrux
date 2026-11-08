-- Loja aberta/fechada (spec 2026-11-07 quadro-de-pedidos). IF NOT EXISTS: added BEFORE the Deploy.
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "ordersClosedAt" TIMESTAMP(3);
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "ordersClosedPausedIfood" BOOLEAN NOT NULL DEFAULT false;
