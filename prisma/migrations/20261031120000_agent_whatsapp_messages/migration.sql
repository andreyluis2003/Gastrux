-- Official WhatsApp number of Gastrux: conversations with clients (additive)
CREATE TYPE "AgentMessageDirection" AS ENUM ('IN', 'OUT');

CREATE TABLE "agent_whatsapp_messages" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "waId" TEXT NOT NULL,
    "userId" TEXT,
    "restaurantId" TEXT,
    "direction" "AgentMessageDirection" NOT NULL,
    "text" TEXT NOT NULL,
    "messageType" TEXT NOT NULL DEFAULT 'text',
    "waMessageId" TEXT,
    "status" TEXT,
    "error" TEXT,
    "agentActionId" TEXT,
    "sentBy" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_whatsapp_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_whatsapp_messages_waMessageId_key" ON "agent_whatsapp_messages"("waMessageId");
CREATE INDEX "agent_whatsapp_messages_phone_createdAt_idx" ON "agent_whatsapp_messages"("phone", "createdAt");
CREATE INDEX "agent_whatsapp_messages_direction_readAt_idx" ON "agent_whatsapp_messages"("direction", "readAt");
