-- Allow safe upserts by (gateway, gatewaySubscriptionId) from both the Stripe
-- and Mercado Pago webhook handlers, so retried webhook deliveries never
-- create duplicate Subscription rows. Postgres treats multiple NULLs in a
-- unique index as distinct, so pre-webhook rows with a null
-- gatewaySubscriptionId are unaffected.
CREATE UNIQUE INDEX "subscriptions_gateway_gatewaySubscriptionId_key" ON "subscriptions"("gateway", "gatewaySubscriptionId");
