-- CreateEnum
CREATE TYPE "WeeklyMenuOrderStatus" AS ENUM ('PLACED', 'RELEASING', 'RELEASED', 'CANCELLED');

-- CreateTable
CREATE TABLE "weekly_menus" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "serviceDate" TEXT NOT NULL,
    "orderDeadline" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_menus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_menu_items" (
    "id" TEXT NOT NULL,
    "weeklyMenuId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "portionLimit" INTEGER,

    CONSTRAINT "weekly_menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_menu_orders" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "weeklyMenuId" TEXT NOT NULL,
    "status" "WeeklyMenuOrderStatus" NOT NULL DEFAULT 'PLACED',
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerEmail" TEXT,
    "isPickup" BOOLEAN NOT NULL,
    "deliveryAddress" TEXT,
    "deliveryCity" TEXT,
    "deliveryZipCode" TEXT,
    "kitchenNote" TEXT NOT NULL,
    "paymentMethod" "DeliveryPaymentMethod" NOT NULL,
    "cashChangeFor" DOUBLE PRECISION,
    "voucherBrand" TEXT,
    "paymentNote" TEXT NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "deliveryFee" DOUBLE PRECISION NOT NULL,
    "discount" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "couponRedemptionId" TEXT,
    "couponCode" TEXT,
    "orderNumber" TEXT NOT NULL,
    "orderId" TEXT,
    "releasingAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weekly_menu_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_menu_order_items" (
    "id" TEXT NOT NULL,
    "weeklyMenuOrderId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "quantity" INTEGER NOT NULL,
    "specialInstructions" TEXT,

    CONSTRAINT "weekly_menu_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "weekly_menus_restaurantId_serviceDate_key" ON "weekly_menus"("restaurantId", "serviceDate");

-- CreateIndex
CREATE INDEX "weekly_menu_items_menuItemId_idx" ON "weekly_menu_items"("menuItemId");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_menu_items_weeklyMenuId_menuItemId_key" ON "weekly_menu_items"("weeklyMenuId", "menuItemId");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_menu_orders_orderNumber_key" ON "weekly_menu_orders"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_menu_orders_orderId_key" ON "weekly_menu_orders"("orderId");

-- CreateIndex
CREATE INDEX "weekly_menu_orders_weeklyMenuId_status_idx" ON "weekly_menu_orders"("weeklyMenuId", "status");

-- CreateIndex
CREATE INDEX "weekly_menu_orders_status_idx" ON "weekly_menu_orders"("status");

-- CreateIndex
CREATE INDEX "weekly_menu_orders_restaurantId_idx" ON "weekly_menu_orders"("restaurantId");

-- CreateIndex
CREATE INDEX "weekly_menu_order_items_weeklyMenuOrderId_idx" ON "weekly_menu_order_items"("weeklyMenuOrderId");

-- AddForeignKey
ALTER TABLE "weekly_menus" ADD CONSTRAINT "weekly_menus_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_menu_items" ADD CONSTRAINT "weekly_menu_items_weeklyMenuId_fkey" FOREIGN KEY ("weeklyMenuId") REFERENCES "weekly_menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_menu_items" ADD CONSTRAINT "weekly_menu_items_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_menu_orders" ADD CONSTRAINT "weekly_menu_orders_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_menu_orders" ADD CONSTRAINT "weekly_menu_orders_weeklyMenuId_fkey" FOREIGN KEY ("weeklyMenuId") REFERENCES "weekly_menus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_menu_order_items" ADD CONSTRAINT "weekly_menu_order_items_weeklyMenuOrderId_fkey" FOREIGN KEY ("weeklyMenuOrderId") REFERENCES "weekly_menu_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

