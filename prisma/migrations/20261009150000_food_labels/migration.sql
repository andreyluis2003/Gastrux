-- Etiquetas de manipulação e controle de validades (spec 2026-10-09)
CREATE TYPE "LabelItemType" AS ENUM ('RECIPE', 'INGREDIENT');
CREATE TYPE "LabelStorage" AS ENUM ('AMBIENT', 'CHILLED', 'FROZEN');
CREATE TYPE "LabelStatus" AS ENUM ('ACTIVE', 'USED', 'DISCARDED');

-- Shelf life per storage; the defaults also fill the existing rows (preparation 0/3/30, opened ingredient -/3/-)
ALTER TABLE "recipes" ADD COLUMN "shelfLifeAmbientDays" INTEGER DEFAULT 0;
ALTER TABLE "recipes" ADD COLUMN "shelfLifeChilledDays" INTEGER DEFAULT 3;
ALTER TABLE "recipes" ADD COLUMN "shelfLifeFrozenDays" INTEGER DEFAULT 30;
ALTER TABLE "ingredients" ADD COLUMN "shelfLifeAmbientDays" INTEGER;
ALTER TABLE "ingredients" ADD COLUMN "shelfLifeChilledDays" INTEGER DEFAULT 3;
ALTER TABLE "ingredients" ADD COLUMN "shelfLifeFrozenDays" INTEGER;
ALTER TABLE "restaurants" ADD COLUMN "labelSize" TEXT NOT NULL DEFAULT '60x40';

CREATE TABLE "food_labels" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "itemType" "LabelItemType" NOT NULL,
    "recipeId" TEXT,
    "ingredientId" TEXT,
    "itemName" TEXT NOT NULL,
    "storage" "LabelStorage" NOT NULL,
    "preparedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "quantity" DOUBLE PRECISION,
    "unit" "Unit",
    "batchId" TEXT,
    "printedById" TEXT NOT NULL,
    "status" "LabelStatus" NOT NULL DEFAULT 'ACTIVE',
    "settledAt" TIMESTAMP(3),
    "settledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "food_labels_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "food_labels_restaurantId_status_expiresAt_idx" ON "food_labels"("restaurantId", "status", "expiresAt");
CREATE INDEX "food_labels_restaurantId_createdAt_idx" ON "food_labels"("restaurantId", "createdAt");
ALTER TABLE "food_labels" ADD CONSTRAINT "food_labels_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "food_labels" ADD CONSTRAINT "food_labels_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "food_labels" ADD CONSTRAINT "food_labels_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "food_labels" ADD CONSTRAINT "food_labels_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ingredient_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "food_labels" ADD CONSTRAINT "food_labels_printedById_fkey" FOREIGN KEY ("printedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "food_labels" ADD CONSTRAINT "food_labels_settledById_fkey" FOREIGN KEY ("settledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
