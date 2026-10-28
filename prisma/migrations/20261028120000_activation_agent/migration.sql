-- Agente de ativação, etapa 1 (spec 2026-10-27)
ALTER TABLE "users" ADD COLUMN "whatsapp" TEXT;

CREATE TYPE "AgentChannel" AS ENUM ('EMAIL', 'WHATSAPP', 'OWNER_ALERT');
CREATE TYPE "AgentActionStatus" AS ENUM ('DRAFT', 'SENT', 'DISCARDED', 'FAILED');

CREATE TABLE "agent_actions" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agent" TEXT NOT NULL DEFAULT 'activation',
    "trigger" TEXT NOT NULL,
    "channel" "AgentChannel" NOT NULL,
    "status" "AgentActionStatus" NOT NULL,
    "subject" TEXT,
    "text" TEXT NOT NULL,
    "data" JSONB,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "decidedBy" TEXT,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "agent_actions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "agent_actions_restaurantId_agent_trigger_channel_key" ON "agent_actions"("restaurantId", "agent", "trigger", "channel");
CREATE INDEX "agent_actions_status_createdAt_idx" ON "agent_actions"("status", "createdAt");
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
