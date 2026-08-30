-- ============================================================
-- Phase 44D — Optimize indexes on high-traffic tables
-- Use CREATE INDEX CONCURRENTLY to avoid locking production tables.
-- Run with: psql "$DATABASE_URL" -f scripts/sql/optimize-indexes.sql
-- ============================================================

-- USERS -------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS users_role_idx                  ON users ("role");
CREATE INDEX CONCURRENTLY IF NOT EXISTS users_active_idx                ON users ("active");
CREATE INDEX CONCURRENTLY IF NOT EXISTS users_subscriptionTier_idx      ON users ("subscriptionTier");
CREATE INDEX CONCURRENTLY IF NOT EXISTS users_subscriptionStatus_idx    ON users ("subscriptionStatus");
CREATE INDEX CONCURRENTLY IF NOT EXISTS users_lastSignInAt_idx          ON users ("lastSignInAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS users_createdAt_idx             ON users ("createdAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS users_currentRestaurantId_idx   ON users ("currentRestaurantId");

-- PAYMENTS ----------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS payments_rest_status_idx        ON payments ("restaurantId", "status");
CREATE INDEX CONCURRENTLY IF NOT EXISTS payments_rest_created_idx       ON payments ("restaurantId", "createdAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS payments_gateway_status_idx     ON payments ("gateway", "status");
CREATE INDEX CONCURRENTLY IF NOT EXISTS payments_status_created_idx     ON payments ("status", "createdAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS payments_subscriptionId_idx     ON payments ("subscriptionId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS payments_customerEmail_idx      ON payments ("customerEmail");
CREATE INDEX CONCURRENTLY IF NOT EXISTS payments_processedAt_idx        ON payments ("processedAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS payments_gatewayPaymentId_idx   ON payments ("gatewayPaymentId");

-- SUBSCRIPTIONS -----------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS subscriptions_rest_status_idx   ON subscriptions ("restaurantId", "status");
CREATE INDEX CONCURRENTLY IF NOT EXISTS subscriptions_tier_idx          ON subscriptions ("tier");
CREATE INDEX CONCURRENTLY IF NOT EXISTS subscriptions_gateway_idx       ON subscriptions ("gateway");
CREATE INDEX CONCURRENTLY IF NOT EXISTS subscriptions_cancelledAt_idx   ON subscriptions ("cancelledAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS subscriptions_createdAt_idx     ON subscriptions ("createdAt");

-- NOTIFICATIONS -----------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS notifications_restaurantId_idx          ON "Notification" ("restaurantId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS notifications_archived_idx              ON "Notification" ("archived");
CREATE INDEX CONCURRENTLY IF NOT EXISTS notifications_user_read_archived_idx    ON "Notification" ("userId", "read", "archived");
CREATE INDEX CONCURRENTLY IF NOT EXISTS notifications_rest_created_idx          ON "Notification" ("restaurantId", "createdAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS notifications_user_created_idx          ON "Notification" ("userId", "createdAt");

-- RESTAURANTS -------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS restaurants_subscriptionTier_idx  ON restaurants ("subscriptionTier");
CREATE INDEX CONCURRENTLY IF NOT EXISTS restaurants_ownerId_idx           ON restaurants ("ownerId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS restaurants_trialEndsAt_idx       ON restaurants ("trialEndsAt");

VACUUM ANALYZE users;
VACUUM ANALYZE payments;
VACUUM ANALYZE subscriptions;
VACUUM ANALYZE "Notification";
VACUUM ANALYZE restaurants;
