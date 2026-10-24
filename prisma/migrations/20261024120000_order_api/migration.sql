-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DeliveryPlatform" ADD VALUE 'gastrux_api';
ALTER TYPE "DeliveryPlatform" ADD VALUE 'keeta';
ALTER TYPE "DeliveryPlatform" ADD VALUE 'ninety_nine_food';

-- AlterTable
ALTER TABLE "external_orders" ADD COLUMN     "apiKeyId" TEXT,
ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "paidOnline" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paymentMethod" "DeliveryPaymentMethod",
ADD COLUMN     "scheduledFor" TIMESTAMP(3),
ADD COLUMN     "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN     "code" TEXT;

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "deliveryAutoAccept" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "order_api_keys" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "callbackUrl" TEXT,
    "callbackSecret" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "order_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_api_keys_prefix_key" ON "order_api_keys"("prefix");

-- CreateIndex
CREATE UNIQUE INDEX "order_api_keys_keyHash_key" ON "order_api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "order_api_keys_restaurantId_idx" ON "order_api_keys"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "menu_items_restaurantId_code_key" ON "menu_items"("restaurantId", "code");

-- AddForeignKey
ALTER TABLE "order_api_keys" ADD CONSTRAINT "order_api_keys_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_api_keys" ADD CONSTRAINT "order_api_keys_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "delivery_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

