-- "Na contagem do dia, conta como" (spec 2026-10-26 lanchonete)
CREATE TABLE "recipe_count_parts" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "partRecipeId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    CONSTRAINT "recipe_count_parts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "recipe_count_parts_recipeId_partRecipeId_key" ON "recipe_count_parts"("recipeId", "partRecipeId");
CREATE INDEX "recipe_count_parts_restaurantId_partRecipeId_idx" ON "recipe_count_parts"("restaurantId", "partRecipeId");
ALTER TABLE "recipe_count_parts" ADD CONSTRAINT "recipe_count_parts_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recipe_count_parts" ADD CONSTRAINT "recipe_count_parts_partRecipeId_fkey" FOREIGN KEY ("partRecipeId") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
