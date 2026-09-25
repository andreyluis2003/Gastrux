-- Payments received directly by a restaurant through its own Mercado Pago
-- account (as opposed to MERCADO_PAGO = Gastrux's own subscription billing).
ALTER TYPE "PaymentGateway" ADD VALUE 'MERCADO_PAGO_CONNECT';
