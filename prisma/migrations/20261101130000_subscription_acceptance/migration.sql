-- Proof of the Terms accepted when subscribing (additive; a new table with no foreign keys, it outlives the account)
CREATE TABLE "subscription_acceptances" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "billingCycle" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "gateway" TEXT NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_acceptances_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "subscription_acceptances_restaurantId_createdAt_idx" ON "subscription_acceptances"("restaurantId", "createdAt");
