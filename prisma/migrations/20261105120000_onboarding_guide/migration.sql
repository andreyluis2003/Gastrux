-- Primeiro acesso guiado (spec 2026-11-05): how the restaurant sells and the guide steps marked done (additive, nullable)
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "onboardingGuide" JSONB;
