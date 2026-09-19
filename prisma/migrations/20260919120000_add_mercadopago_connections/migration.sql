-- One row per restaurant: the restaurant's own Mercado Pago OAuth connection.
-- accessToken/refreshToken hold AES-256-GCM payloads ("v1:..."), never plaintext.
CREATE TYPE "MercadoPagoConnectionStatus" AS ENUM ('ACTIVE', 'NEEDS_RECONNECT');

CREATE TABLE "mercado_pago_connections" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "mpUserId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "publicKey" TEXT,
    "liveMode" BOOLEAN NOT NULL DEFAULT true,
    "lifetimeSeconds" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "MercadoPagoConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRefreshAt" TIMESTAMP(3),
    "lastRefreshError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mercado_pago_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mercado_pago_connections_restaurantId_key" ON "mercado_pago_connections"("restaurantId");

CREATE INDEX "mercado_pago_connections_status_expiresAt_idx" ON "mercado_pago_connections"("status", "expiresAt");

ALTER TABLE "mercado_pago_connections" ADD CONSTRAINT "mercado_pago_connections_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
