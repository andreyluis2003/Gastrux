-- Notes of the Gastrux team about each client (platform screens only)
CREATE TABLE "platform_client_notes" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "authorEmail" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_client_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "platform_client_notes_restaurantId_createdAt_idx" ON "platform_client_notes"("restaurantId", "createdAt");

ALTER TABLE "platform_client_notes" ADD CONSTRAINT "platform_client_notes_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
