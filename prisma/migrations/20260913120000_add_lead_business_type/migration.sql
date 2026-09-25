-- Adds the business-type answer (pizzaria/hamburgueria/japones/etc, reusing
-- the same slugs as lib/marketing/segments.ts) to the post-signup
-- qualification screen. Nullable: optional, and existing users have none.
ALTER TABLE "users" ADD COLUMN "businessType" TEXT;
