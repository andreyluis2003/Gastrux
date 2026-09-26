-- Stores the Meta "business_id" returned by WhatsApp Embedded Signup
-- (developers.facebook.com Embedded Signup v4 message event). Not used for
-- auth or messaging — kept for support/debugging when a restaurant's Meta
-- Business Manager needs to be looked up.
ALTER TABLE "whatsapp_configs" ADD COLUMN "metaBusinessId" TEXT;
