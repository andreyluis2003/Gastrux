-- Onboarding tips e-mails: the owner can stop them from a link in the e-mail (2026-10-19)
ALTER TABLE "users" ADD COLUMN "onboardingEmailsOptOut" BOOLEAN NOT NULL DEFAULT false;
