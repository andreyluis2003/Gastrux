-- Contagem de espetos / contagem do dia (spec 2026-10-16)
CREATE TYPE "DailyCountStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "DailyCountEntryKind" AS ENUM ('OPENING', 'MOUNTED', 'LOSS');

ALTER TABLE "recipes" ADD COLUMN "dailyCount" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "daily_counts" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "status" "DailyCountStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "daily_counts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "daily_counts_restaurantId_status_idx" ON "daily_counts"("restaurantId", "status");
CREATE INDEX "daily_counts_restaurantId_closedAt_idx" ON "daily_counts"("restaurantId", "closedAt");
ALTER TABLE "daily_counts" ADD CONSTRAINT "daily_counts_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "daily_counts" ADD CONSTRAINT "daily_counts_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- One open night per restaurant (Prisma cannot express a partial index)
CREATE UNIQUE INDEX "daily_counts_one_open_per_restaurant" ON "daily_counts"("restaurantId") WHERE "status" = 'OPEN';

CREATE TABLE "daily_count_entries" (
    "id" TEXT NOT NULL,
    "countId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "kind" "DailyCountEntryKind" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "daily_count_entries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "daily_count_entries_countId_idx" ON "daily_count_entries"("countId");
CREATE INDEX "daily_count_entries_restaurantId_idx" ON "daily_count_entries"("restaurantId");
ALTER TABLE "daily_count_entries" ADD CONSTRAINT "daily_count_entries_countId_fkey" FOREIGN KEY ("countId") REFERENCES "daily_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "daily_count_entries" ADD CONSTRAINT "daily_count_entries_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "daily_count_entries" ADD CONSTRAINT "daily_count_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "daily_count_lines" (
    "id" TEXT NOT NULL,
    "countId" TEXT NOT NULL,
    "recipeId" TEXT,
    "recipeName" TEXT NOT NULL,
    "opening" INTEGER NOT NULL,
    "mounted" INTEGER NOT NULL,
    "sold" INTEGER NOT NULL,
    "loss" INTEGER NOT NULL,
    "expected" INTEGER NOT NULL,
    "counted" INTEGER NOT NULL,
    "difference" INTEGER NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    CONSTRAINT "daily_count_lines_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "daily_count_lines_countId_recipeId_key" ON "daily_count_lines"("countId", "recipeId");
ALTER TABLE "daily_count_lines" ADD CONSTRAINT "daily_count_lines_countId_fkey" FOREIGN KEY ("countId") REFERENCES "daily_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "daily_count_lines" ADD CONSTRAINT "daily_count_lines_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
