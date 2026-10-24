import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { recordAudit, type RestaurantMember } from '@/lib/auth/restaurant-role';
import { encryptSecret } from '@/lib/security/credential-crypto';
import { isTierFeatureEnabled, restaurantTier } from '@/lib/tier-guard';
import { exchangeAuthorizationCode, ifoodMode, listMerchants, requestUserCode } from './client';

/**
 * Connecting a restaurant to its iFood store (plan 2026-10-24 ifood, Task 7). Distributed app: the restaurant asks a
 * userCode, types it in the iFood Partner Portal and pastes back the authorization code. Test (centralized) app: the
 * Gastrux staff links the test store to a restaurant. A store (merchantId) belongs to one restaurant only.
 */
export class IfoodConnectError extends Error {
  constructor(message: string, public status = 400, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

/** "Desconectada" when the last successful poll is older than this */
const STALE_POLL_MS = 2 * 60_000;
const where = (restaurantId: string) => ({ restaurantId_platform: { restaurantId, platform: 'ifood' as const } });

async function assertBusiness(restaurantId: string) {
  if (!isTierFeatureEnabled(await restaurantTier(restaurantId), 'deliveryPlatforms')) {
    throw new IfoodConnectError('O iFood integrado é do plano Business', 403, { upgradeUrl: '/pricing' });
  }
}

/** The app's iFood credentials are set (they come with the homologation; before it the screen says so) */
const configured = () => !!(process.env.IFOOD_CLIENT_ID && process.env.IFOOD_CLIENT_SECRET);

function assertDistributed() {
  if (!configured()) throw new IfoodConnectError('A conexão com o iFood ainda está em homologação no iFood', 409);
  if (ifoodMode() === 'centralized') throw new IfoodConnectError('Modo de teste: o administrador liga a loja', 409);
}

async function ifoodIntegration(restaurantId: string): Promise<{ id: string }> {
  const random = () => crypto.randomBytes(24).toString('hex');
  // apiKey/webhookSecret are required by the table and unused by the iFood (it is polled, not pushed)
  return prisma.deliveryIntegration.upsert({
    where: where(restaurantId),
    create: { restaurantId, platform: 'ifood', apiKey: random(), webhookSecret: random(), isActive: false },
    update: {},
    select: { id: true },
  });
}

async function assertFree(restaurantId: string, merchantId: string) {
  const other = await prisma.deliveryIntegration.findFirst({
    where: { platform: 'ifood', storeId: merchantId, restaurantId: { not: restaurantId } },
    select: { id: true },
  });
  if (other) throw new IfoodConnectError('Esta loja do iFood já está ligada a outro restaurante do Gastrux', 409);
}

async function link(integrationId: string, merchant: { id: string; name: string }) {
  await prisma.deliveryIntegration.update({
    where: { id: integrationId },
    data: { storeId: merchant.id, storeName: merchant.name, isActive: true, syncStatus: 'PENDING', syncError: null },
  });
}

export async function ifoodState(restaurantId: string) {
  const row = await prisma.deliveryIntegration.findUnique({
    where: where(restaurantId),
    select: { storeId: true, storeName: true, isActive: true, lastPolledAt: true, lastOrderAt: true, syncStatus: true, syncError: true },
  });
  const connected = !!row?.storeId;
  return {
    mode: ifoodMode(),
    configured: configured(),
    available: isTierFeatureEnabled(await restaurantTier(restaurantId), 'deliveryPlatforms'),
    connected,
    merchant: connected ? { id: row!.storeId!, name: row!.storeName ?? '' } : null,
    paused: connected && !row!.isActive,
    stale: connected && (!row!.lastPolledAt || Date.now() - row!.lastPolledAt.getTime() > STALE_POLL_MS),
    lastPolledAt: row?.lastPolledAt ?? null,
    lastOrderAt: row?.lastOrderAt ?? null,
    syncStatus: row?.syncStatus ?? null,
    syncError: row?.syncError ?? null,
  };
}

export async function startConnection(member: RestaurantMember) {
  await assertBusiness(member.restaurantId);
  assertDistributed();
  const integration = await ifoodIntegration(member.restaurantId);
  const code = await requestUserCode();
  await prisma.deliveryIntegration.update({ where: { id: integration.id }, data: { oauthVerifier: encryptSecret(code.authorizationCodeVerifier) } });
  return { userCode: code.userCode, verificationUrlComplete: code.verificationUrlComplete, expiresIn: code.expiresIn };
}

export async function finishConnection(member: RestaurantMember, authorizationCode: unknown) {
  await assertBusiness(member.restaurantId);
  assertDistributed();
  const codeText = typeof authorizationCode === 'string' ? authorizationCode.trim() : '';
  if (!codeText || codeText.length > 200) throw new IfoodConnectError('Cole o código de autorização que o Portal do Parceiro mostrou');
  const integration = await ifoodIntegration(member.restaurantId);
  await exchangeAuthorizationCode(integration.id, codeText);
  const merchants = await listMerchants(integration);
  if (merchants.length === 0) throw new IfoodConnectError('Este acesso do iFood não tem nenhuma loja', 409);
  if (merchants.length > 1) return { merchants };
  await assertFree(member.restaurantId, merchants[0].id);
  await link(integration.id, merchants[0]);
  await recordAudit(member, { action: 'UPDATE', entityType: 'DeliveryIntegration', entityId: integration.id, changes: { ifood: 'connected', merchantId: merchants[0].id } });
  return { merchant: merchants[0] };
}

export async function selectMerchant(member: RestaurantMember, merchantId: unknown) {
  await assertBusiness(member.restaurantId);
  assertDistributed();
  const integration = await ifoodIntegration(member.restaurantId);
  const merchant = (await listMerchants(integration)).find((m) => m.id === merchantId);
  if (!merchant) throw new IfoodConnectError('Escolha uma das lojas da lista');
  await assertFree(member.restaurantId, merchant.id);
  await link(integration.id, merchant);
  await recordAudit(member, { action: 'UPDATE', entityType: 'DeliveryIntegration', entityId: integration.id, changes: { ifood: 'connected', merchantId: merchant.id } });
  return { merchant };
}

/** Pause keeps the link and the tokens; with no polling the iFood closes the store after a while */
export async function setPaused(member: RestaurantMember, paused: boolean) {
  const row = await prisma.deliveryIntegration.findUnique({ where: where(member.restaurantId), select: { id: true, storeId: true } });
  if (!row?.storeId) throw new IfoodConnectError('Conecte a loja do iFood primeiro', 409);
  await prisma.deliveryIntegration.update({ where: { id: row.id }, data: { isActive: !paused } });
  await recordAudit(member, { action: 'UPDATE', entityType: 'DeliveryIntegration', entityId: row.id, changes: { ifood: paused ? 'paused' : 'resumed' } });
  return { paused };
}

export async function disconnect(member: RestaurantMember) {
  const row = await prisma.deliveryIntegration.findUnique({ where: where(member.restaurantId), select: { id: true, storeId: true } });
  if (!row) return { connected: false };
  await prisma.deliveryIntegration.update({
    where: { id: row.id },
    data: { isActive: false, storeId: null, storeName: null, oauthAccessToken: null, oauthRefreshToken: null, oauthExpiresAt: null, oauthVerifier: null },
  });
  await recordAudit(member, { action: 'UPDATE', entityType: 'DeliveryIntegration', entityId: row.id, changes: { ifood: 'disconnected', merchantId: row.storeId } });
  return { connected: false };
}

/** Test app only: the Gastrux staff links a store the centralized token sees to a restaurant */
export async function staffLink(restaurantId: unknown, merchantId: unknown) {
  if (ifoodMode() !== 'centralized') throw new IfoodConnectError('Só no modo de teste: em produção o restaurante conecta pela tela do iFood', 409);
  if (typeof restaurantId !== 'string' || typeof merchantId !== 'string') throw new IfoodConnectError('Informe restaurantId e merchantId');
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { id: true } });
  if (!restaurant) throw new IfoodConnectError('Restaurante não encontrado', 404);
  const merchant = (await listMerchants(null)).find((m) => m.id === merchantId);
  if (!merchant) throw new IfoodConnectError('O app de teste não vê esta loja do iFood');
  await assertFree(restaurantId, merchant.id);
  const integration = await ifoodIntegration(restaurantId);
  await link(integration.id, merchant);
  return { merchant };
}
