-- How a delivery customer pays (chosen at checkout) and what the restaurant
-- accepts on delivery. Existing orders keep NULL payment fields.
CREATE TYPE "DeliveryPaymentMethod" AS ENUM ('ONLINE_PIX', 'ONLINE_CARD', 'CASH', 'CREDIT_ON_DELIVERY', 'DEBIT_ON_DELIVERY', 'VOUCHER_ON_DELIVERY');

ALTER TABLE "orders" ADD COLUMN "paymentMethod" "DeliveryPaymentMethod",
ADD COLUMN "cashChangeFor" DECIMAL(12,2),
ADD COLUMN "voucherBrand" TEXT;

CREATE TABLE "delivery_payment_settings" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "acceptCash" BOOLEAN NOT NULL DEFAULT true,
    "acceptCreditOnDelivery" BOOLEAN NOT NULL DEFAULT true,
    "acceptDebitOnDelivery" BOOLEAN NOT NULL DEFAULT true,
    "acceptVoucherOnDelivery" BOOLEAN NOT NULL DEFAULT false,
    "voucherBrands" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_payment_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "delivery_payment_settings_restaurantId_key" ON "delivery_payment_settings"("restaurantId");

ALTER TABLE "delivery_payment_settings" ADD CONSTRAINT "delivery_payment_settings_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
