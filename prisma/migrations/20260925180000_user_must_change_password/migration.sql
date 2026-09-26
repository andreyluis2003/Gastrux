-- A password chosen by someone else (a hire, a reset by the platform) must be changed at the first
-- access. Idempotent, like the other migrations of this branch.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
