-- Adds the post-signup lead-qualification answers (businessStage,
-- locationCount, mainPainPoint) plus the derived leadQuality segment used to
-- tell real restaurant owners apart from curious/non-buyer signups. All
-- nullable: answering is optional and existing users have no answers yet.
ALTER TABLE "users" ADD COLUMN "businessStage" TEXT;
ALTER TABLE "users" ADD COLUMN "locationCount" TEXT;
ALTER TABLE "users" ADD COLUMN "mainPainPoint" TEXT;
ALTER TABLE "users" ADD COLUMN "leadQuality" TEXT;
