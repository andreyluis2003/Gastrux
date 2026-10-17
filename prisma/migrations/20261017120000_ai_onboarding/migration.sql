-- IA na implantação (spec 2026-10-17 ia-implantacao)
ALTER TABLE "ai_questions" ADD COLUMN "free" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ai_questions" ADD COLUMN "attachments" JSONB;
CREATE TABLE "ai_drafts" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "questionId" TEXT,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "appliedById" TEXT,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_drafts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_drafts_restaurantId_createdAt_idx" ON "ai_drafts"("restaurantId", "createdAt");
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "ai_questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
