-- Origin of a sign-up (additive; a new table, so nothing depends on it before the migration)
CREATE TABLE "signup_attributions" (
    "restaurantId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "medium" TEXT,
    "campaign" TEXT,
    "content" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signup_attributions_pkey" PRIMARY KEY ("restaurantId")
);

ALTER TABLE "signup_attributions" ADD CONSTRAINT "signup_attributions_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
