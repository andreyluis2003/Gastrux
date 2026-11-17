-- Comanda de entrega: o nome do entregador (cadastrado ou digitado em "Outro"), como no pedido de delivery (spec 2026-11-17)
ALTER TABLE "order_sessions" ADD COLUMN "driverName" TEXT;
