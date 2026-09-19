import { MercadoPagoConfig } from 'mercadopago';
import { prisma } from '@/lib/prisma';
import { encryptSecret, decryptSecret } from '@/lib/security/credential-crypto';
import { createNotification } from '@/lib/notification-utils';
import { refreshTokens, MpOAuthError, type MpOAuthTokens } from './oauth-client';
import { shouldRefresh, isExpiredOrNear, isExpired } from './refresh-policy';

/**
 * Persistence and lifecycle of a restaurant's Mercado Pago OAuth connection.
 * Tokens are stored encrypted (AES-256-GCM) and only decrypted in memory to
 * build an SDK client for that one restaurant.
 */

export type RefreshOutcome = 'refreshed' | 'needs_reconnect' | 'failed' | 'skipped';

export async function saveConnection(restaurantId: string, tokens: MpOAuthTokens) {
  const data = {
    mpUserId: tokens.mpUserId,
    accessToken: encryptSecret(tokens.accessToken),
    refreshToken: encryptSecret(tokens.refreshToken),
    publicKey: tokens.publicKey,
    liveMode: tokens.liveMode,
    lifetimeSeconds: tokens.lifetimeSeconds,
    expiresAt: new Date(Date.now() + tokens.lifetimeSeconds * 1000),
    status: 'ACTIVE' as const,
    lastRefreshError: null,
  };
  return prisma.mercadoPagoConnection.upsert({
    where: { restaurantId },
    create: { restaurantId, ...data },
    update: { ...data, connectedAt: new Date() },
  });
}

export function getConnection(restaurantId: string) {
  return prisma.mercadoPagoConnection.findUnique({ where: { restaurantId } });
}

export async function getActiveConnection(restaurantId: string) {
  const conn = await getConnection(restaurantId);
  return conn && conn.status === 'ACTIVE' ? conn : null;
}

export async function hasActiveConnection(restaurantId: string): Promise<boolean> {
  const conn = await prisma.mercadoPagoConnection.findFirst({
    where: { restaurantId, status: 'ACTIVE' },
    select: { id: true },
  });
  return Boolean(conn);
}

async function notifyOwnerToReconnect(restaurantId: string): Promise<void> {
  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { ownerId: true },
    });
    if (!restaurant?.ownerId) return;
    await createNotification({
      userId: restaurant.ownerId,
      type: 'PAYMENT_FAILED',
      severity: 'HIGH',
      title: 'Reconecte seu Mercado Pago',
      message:
        'A conexão com o Mercado Pago expirou ou foi revogada. Enquanto isso, o PIX online fica indisponível para os seus clientes.',
      actionUrl: '/dashboard/pagamentos/conectar',
      actionLabel: 'Reconectar',
    });
  } catch (error) {
    console.error('[mp-connect] failed to notify owner:', error);
  }
}

export async function markNeedsReconnect(restaurantId: string, reason: string): Promise<void> {
  const result = await prisma.mercadoPagoConnection.updateMany({
    where: { restaurantId, status: 'ACTIVE' },
    data: { status: 'NEEDS_RECONNECT', lastRefreshError: reason.slice(0, 500) },
  });
  // Only notify on the ACTIVE -> NEEDS_RECONNECT transition, not on every failed call.
  if (result.count > 0) await notifyOwnerToReconnect(restaurantId);
}

export async function refreshConnection(restaurantId: string): Promise<RefreshOutcome> {
  const conn = await getActiveConnection(restaurantId);
  if (!conn) return 'skipped';

  // Claim the refresh: updateMany bumps updatedAt, so a concurrent caller that
  // read the same row matches zero rows and skips. Mercado Pago refresh tokens
  // are rotated, so refreshing twice with the same token would fail the second
  // time and wrongly mark a healthy connection as revoked.
  const claim = await prisma.mercadoPagoConnection.updateMany({
    where: { restaurantId, status: 'ACTIVE', updatedAt: conn.updatedAt },
    data: { lastRefreshError: null },
  });
  if (claim.count === 0) return 'skipped';

  try {
    const tokens = await refreshTokens(decryptSecret(conn.refreshToken));
    await prisma.mercadoPagoConnection.update({
      where: { restaurantId },
      data: {
        accessToken: encryptSecret(tokens.accessToken),
        refreshToken: encryptSecret(tokens.refreshToken),
        publicKey: tokens.publicKey ?? conn.publicKey,
        liveMode: tokens.liveMode,
        lifetimeSeconds: tokens.lifetimeSeconds,
        expiresAt: new Date(Date.now() + tokens.lifetimeSeconds * 1000),
        lastRefreshAt: new Date(),
        lastRefreshError: null,
      },
    });
    return 'refreshed';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof MpOAuthError && error.revoked) {
      await markNeedsReconnect(restaurantId, message);
      return 'needs_reconnect';
    }
    await prisma.mercadoPagoConnection.update({
      where: { restaurantId },
      data: { lastRefreshError: message.slice(0, 500) },
    });
    if (isExpired(conn)) {
      await markNeedsReconnect(restaurantId, message);
      return 'needs_reconnect';
    }
    return 'failed';
  }
}

/**
 * Builds a Mercado Pago SDK client for ONE restaurant, using that
 * restaurant's own token. Returns null when it has no usable connection;
 * callers must treat null as "online payment unavailable" and never fall back
 * to the platform token.
 */
export async function getMpClientForRestaurant(restaurantId: string): Promise<MercadoPagoConfig | null> {
  let conn = await getActiveConnection(restaurantId);
  if (!conn) return null;

  if (isExpiredOrNear(conn)) {
    await refreshConnection(restaurantId);
    conn = await getActiveConnection(restaurantId);
    if (!conn || isExpired(conn)) return null;
  }

  return new MercadoPagoConfig({
    accessToken: decryptSecret(conn.accessToken),
    options: { timeout: 8000 },
  });
}

export async function disconnect(restaurantId: string): Promise<void> {
  await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId } });
}

export async function refreshExpiringConnections(now: number = Date.now()) {
  const active = await prisma.mercadoPagoConnection.findMany({
    where: { status: 'ACTIVE' },
    select: { restaurantId: true, expiresAt: true, lifetimeSeconds: true },
  });

  const summary = { checked: active.length, refreshed: 0, needsReconnect: 0, failed: 0 };
  for (const conn of active) {
    if (!shouldRefresh(conn, now)) continue;
    const outcome = await refreshConnection(conn.restaurantId);
    if (outcome === 'refreshed') summary.refreshed++;
    else if (outcome === 'needs_reconnect') summary.needsReconnect++;
    else if (outcome === 'failed') summary.failed++;
  }
  return summary;
}
