-- Final review of the iFood integration (2026-10-24)

-- I4: one restaurant per platform store. A store id repeated across restaurants of the same platform was never valid
-- (it routed one store's orders to another restaurant): keep the most recently updated row, clear the others.
UPDATE "delivery_integrations" d
SET "storeId" = NULL, "isActive" = false
WHERE d."storeId" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "delivery_integrations" o
    WHERE o."platform" = d."platform" AND o."storeId" = d."storeId" AND o."id" <> d."id"
      AND (o."updatedAt" > d."updatedAt" OR (o."updatedAt" = d."updatedAt" AND o."id" > d."id"))
  );

CREATE UNIQUE INDEX "delivery_integrations_platform_storeId_key" ON "delivery_integrations"("platform", "storeId");

-- I5: an event is processed by one poll at a time, and one server process polls at a time
ALTER TABLE "ifood_events" ADD COLUMN "claimedAt" TIMESTAMP(3);

CREATE TABLE "poll_leases" (
    "name" TEXT NOT NULL,
    "leaseUntil" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "poll_leases_pkey" PRIMARY KEY ("name")
);
