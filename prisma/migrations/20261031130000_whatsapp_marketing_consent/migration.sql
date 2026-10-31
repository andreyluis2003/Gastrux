-- Separate opt-in for marketing templates by WhatsApp (additive; safe to run before the Deploy)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "whatsappMarketingConsentAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "whatsappMarketingConsentVersion" TEXT;
