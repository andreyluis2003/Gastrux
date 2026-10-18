-- Plans of 2026-10-18: internal accounts; every restaurant that exists when this runs is a test account
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "isInternal" BOOLEAN NOT NULL DEFAULT false;
UPDATE "restaurants" SET "isInternal" = true, "subscriptionTier" = CASE WHEN "subscriptionTier" = 'starter' THEN 'business' ELSE "subscriptionTier" END
WHERE "isInternal" = false;
