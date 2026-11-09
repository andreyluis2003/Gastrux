-- CreateTable
CREATE TABLE "agent_reply_suggestions" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "forMessageId" TEXT NOT NULL,
    "forMessageAt" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT,
    "reason" TEXT,
    "model" TEXT,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "outcome" TEXT NOT NULL DEFAULT 'pending',
    "sentMessageId" TEXT,
    "decidedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_reply_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_reply_suggestions_phone_createdAt_idx" ON "agent_reply_suggestions"("phone", "createdAt");

-- CreateIndex
CREATE INDEX "agent_reply_suggestions_createdAt_idx" ON "agent_reply_suggestions"("createdAt");
