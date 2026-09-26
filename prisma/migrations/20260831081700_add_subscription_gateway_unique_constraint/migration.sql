-- Made idempotent on 2026-09-25: the baseline migration already creates what this migration
-- adds, so on an empty database it failed (42P07 / 42710). Guards skip what already exists and
-- change nothing where it does not (the production history).
-- Allow safe upserts by (gateway, gatewaySubscriptionId) from both the Stripe
-- and Mercado Pago webhook handlers, so retried webhook deliveries never
-- create duplicate Subscription rows. Postgres treats multiple NULLs in a
-- unique index as distinct, so pre-webhook rows with a null
-- gatewaySubscriptionId are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_gateway_gatewaySubscriptionId_key" ON "subscriptions"("gateway", "gatewaySubscriptionId");
