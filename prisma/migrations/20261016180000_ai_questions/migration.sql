-- "Pergunte ao Gastrux" questions (spec 2026-10-16 ia-assistente)
CREATE TABLE "ai_questions" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "model" TEXT,
    "detailed" BOOLEAN NOT NULL DEFAULT false,
    "toolCalls" JSONB,
    "deniedTools" JSONB,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "counted" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_questions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_questions_restaurantId_createdAt_idx" ON "ai_questions"("restaurantId", "createdAt");
CREATE INDEX "ai_questions_userId_createdAt_idx" ON "ai_questions"("userId", "createdAt");
ALTER TABLE "ai_questions" ADD CONSTRAINT "ai_questions_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_questions" ADD CONSTRAINT "ai_questions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
