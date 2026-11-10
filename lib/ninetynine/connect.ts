import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { recordAudit, type RestaurantMember } from '@/lib/auth/restaurant-role';
import { alertDeliveryProblem } from '@/lib/kds-integration';
import { isTierFeatureEnabled, restaurantTier } from '@/lib/tier-guard';
import { getAuthorizationUrl, listAuthorizedShops, ninetynineConfig, setStoreStatus, tokenFor, type AuthorizedShop } from './client';

/**
 * Connecting a restaurant to its 99Food store (plan 2026-11-09 99food, Task 6). The store admin authorizes the Gastrux app
 * on the 99Food authorization page; back here the restaurant picks its store among the authorized ones whose phone is the
 * restaurant's (or the owner's WhatsApp). The Gastrux staff can link any authorized store (test store, "não encontramos").
 * A store (app_shop_id) belongs to one restaurant only.
 */
export class NinetynineConnectError extends Error {
  constructor(message: string, public status = 400, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

const PLATFORM = 'ninety_nine_food' as const;
const MAX_PAGES = 10;
const PAGE_SIZE = 15;
const TAKEN = 'Esta loja da 99Food já está ligada a outro restaurante do Gastrux';
const NO_ACCESS = 'A 99Food não liberou o acesso a esta loja: tente de novo em 1 minuto';
const where = (restaurantId: string) => ({ restaurantId_platform: { restaurantId, platform: PLATFORM } });

type Store = { appShopId: string; name: string };

async function assertBusiness(restaurantId: string) {
  if (!isTierFeatureEnabled(await restaurantTier(restaurantId), 'deliveryPlatforms')) {
    throw new NinetynineConnectError('A 99Food integrada é do plano Business', 403, { upgradeUrl: '/pricing' });
  }
}

const configured = () => ninetynineConfig() !== null;

function assertConfigured() {
  if (!configured()) throw new NinetynineConnectError('A conexão com a 99Food não está ligada neste servidor', 409);
}

async function integrationRow(restaurantId: string): Promise<{ id: string }> {
  const random = () => crypto.randomBytes(24).toString('hex');
  // apiKey/webhookSecret are required by the table; the 99Food webhook is checked with the app secret instead
  return prisma.deliveryIntegration.upsert({
    where: where(restaurantId),
    create: { restaurantId, platform: PLATFORM, apiKey: random(), webhookSecret: random(), isActive: false },
    update: {},
    select: { id: true },
  });
}

async function assertFree(restaurantId: string, appShopId: string) {
  const other = await prisma.deliveryIntegration.findFirst({
    where: { platform: PLATFORM, storeId: appShopId, restaurantId: { not: restaurantId } },
    select: { id: true },
  });
  if (other) throw new NinetynineConnectError(TAKEN, 409);
}

/** Every authorized store, up to MAX_PAGES pages */
async function authorizedShops(): Promise<AuthorizedShop[]> {
  const all: AuthorizedShop[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = await listAuthorizedShops(page, PAGE_SIZE);
    all.push(...r.shops);
    if (r.shops.length === 0 || page >= Number(r.total_page ?? 0)) break;
  }
  return all;
}

/** The last 8 digits: the same number with or without country code, area code or the ninth digit's formatting */
function tail(phone: unknown): string | null {
  const digits = String(phone ?? '').replace(/\D/g, '');
  return digits.length >= 8 ? digits.slice(-8) : null;
}

async function ourPhones(restaurantId: string): Promise<Set<string>> {
  const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { phone: true, ownerId: true } });
  const owner = r ? await prisma.user.findUnique({ where: { id: r.ownerId }, select: { whatsapp: true } }) : null;
  return new Set([tail(r?.phone), tail(owner?.whatsapp)].filter((p): p is string => !!p));
}

/** Authorized, bound stores whose phone matches ours (linked elsewhere or not) */
async function matchingShops(restaurantId: string): Promise<Store[]> {
  const phones = await ourPhones(restaurantId);
  if (phones.size === 0) return [];
  return (await authorizedShops())
    .filter((s) => Number(s.bound_flag) === 1)
    .filter((s) => (Array.isArray(s.shop_phone) ? s.shop_phone : []).some((p) => phones.has(tail(p?.phone) ?? '')))
    .map((s) => ({ appShopId: String(s.app_shop_id), name: String(s.shop_name ?? '') }));
}

async function link(integrationId: string, store: Store) {
  try {
    await prisma.deliveryIntegration.update({
      where: { id: integrationId },
      data: {
        storeId: store.appShopId, storeName: store.name, isActive: true, syncStatus: 'PENDING', syncError: null,
        oauthAccessToken: null, oauthExpiresAt: null,
      },
    });
  } catch (e: any) {
    // Another restaurant took the store between the check and here (unique platform + storeId)
    if (e?.code === 'P2002') throw new NinetynineConnectError(TAKEN, 409);
    throw e;
  }
  // A fresh token proves the authorization reaches this store; without it the link is undone
  try {
    await tokenFor(integrationId, true);
  } catch (e) {
    await prisma.deliveryIntegration.update({ where: { id: integrationId }, data: { storeId: null, storeName: null, isActive: false, oauthAccessToken: null, oauthExpiresAt: null } });
    console.warn(`[99food] no token for store ${store.appShopId}: ${e instanceof Error ? e.message : e}`);
    throw new NinetynineConnectError(NO_ACCESS, 502);
  }
}

export async function ninetynineState(restaurantId: string) {
  const row = await prisma.deliveryIntegration.findUnique({
    where: where(restaurantId),
    select: { storeId: true, storeName: true, isActive: true, lastOrderAt: true, syncStatus: true, syncError: true },
  });
  const connected = !!row?.storeId;
  return {
    configured: configured(),
    available: isTierFeatureEnabled(await restaurantTier(restaurantId), 'deliveryPlatforms'),
    connected,
    store: connected ? { appShopId: row!.storeId!, name: row!.storeName ?? '' } : null,
    paused: connected && !row!.isActive,
    status: connected ? { syncStatus: row!.syncStatus, syncError: row!.syncError } : null,
    lastOrderAt: row?.lastOrderAt ?? null,
  };
}

export async function startConnection(member: RestaurantMember) {
  await assertBusiness(member.restaurantId);
  assertConfigured();
  return { url: await getAuthorizationUrl() };
}

export async function candidateStores(member: RestaurantMember): Promise<Store[]> {
  await assertBusiness(member.restaurantId);
  assertConfigured();
  const matching = await matchingShops(member.restaurantId);
  if (matching.length === 0) return [];
  const linked = await prisma.deliveryIntegration.findMany({
    where: { platform: PLATFORM, storeId: { in: matching.map((s) => s.appShopId) }, restaurantId: { not: member.restaurantId } },
    select: { storeId: true },
  });
  const taken = new Set(linked.map((l) => l.storeId));
  return matching.filter((s) => !taken.has(s.appShopId));
}

export async function selectStore(member: RestaurantMember, appShopId: unknown) {
  await assertBusiness(member.restaurantId);
  assertConfigured();
  const id = typeof appShopId === 'string' || typeof appShopId === 'number' ? String(appShopId) : '';
  // Checked again now: the list on the screen may be old
  const store = id ? (await matchingShops(member.restaurantId)).find((s) => s.appShopId === id) : undefined;
  if (!store) throw new NinetynineConnectError('Escolha uma das lojas da lista');
  await assertFree(member.restaurantId, store.appShopId);
  const integration = await integrationRow(member.restaurantId);
  await link(integration.id, store);
  await recordAudit(member, { action: 'UPDATE', entityType: 'DeliveryIntegration', entityId: integration.id, changes: { ninetynine: 'connected', appShopId: store.appShopId } });
  return { store };
}

/** Pause closes the store on the 99Food (until the end of the day or "Retomar") and stops taking its orders */
export async function setPaused(member: RestaurantMember, paused: boolean) {
  const row = await prisma.deliveryIntegration.findUnique({ where: where(member.restaurantId), select: { id: true, storeId: true } });
  if (!row?.storeId) throw new NinetynineConnectError('Conecte a loja da 99Food primeiro', 409);
  try {
    await setStoreStatus(row.id, paused ? 'pause' : 'online');
  } catch (e) {
    console.warn(`[99food] setStatus ${paused ? 'pause' : 'online'} failed: ${e instanceof Error ? e.message : e}`);
    throw new NinetynineConnectError(paused ? 'A 99Food não recebeu a pausa da loja: tente de novo' : 'A 99Food não recebeu a volta da loja: tente de novo', 502);
  }
  await prisma.deliveryIntegration.update({ where: { id: row.id }, data: { isActive: !paused } });
  await recordAudit(member, { action: 'UPDATE', entityType: 'DeliveryIntegration', entityId: row.id, changes: { ninetynine: paused ? 'paused' : 'resumed' } });
  return { paused };
}

/** Clears the link and the token; the authorization itself is removed in the 99Food portal */
export async function disconnect(member: RestaurantMember) {
  const row = await prisma.deliveryIntegration.findUnique({ where: where(member.restaurantId), select: { id: true, storeId: true } });
  if (!row) return { connected: false };
  await prisma.deliveryIntegration.update({
    where: { id: row.id },
    data: { isActive: false, storeId: null, storeName: null, oauthAccessToken: null, oauthRefreshToken: null, oauthExpiresAt: null, oauthVerifier: null },
  });
  await recordAudit(member, { action: 'UPDATE', entityType: 'DeliveryIntegration', entityId: row.id, changes: { ninetynine: 'disconnected', appShopId: row.storeId } });
  return { connected: false };
}

/**
 * The store toggle (Loja aberta/fechada): closing pauses a linked, active 99Food store; opening puts it back online. A store
 * paused by hand on the 99Food screen (isActive false) is left alone. Best effort: a 99Food failure never blocks the toggle;
 * it is logged and goes to the sino.
 */
export async function followStoreToggle(restaurantId: string, closed: boolean): Promise<null | 'paused' | 'resumed' | 'failed'> {
  if (!configured()) return null;
  const row = await prisma.deliveryIntegration.findUnique({ where: where(restaurantId), select: { id: true, storeId: true, isActive: true } });
  if (!row?.storeId || !row.isActive) return null;
  try {
    await setStoreStatus(row.id, closed ? 'pause' : 'online');
    return closed ? 'paused' : 'resumed';
  } catch (e) {
    console.warn(`[99food] store toggle ${closed ? 'pause' : 'online'} failed for ${row.storeId}: ${e instanceof Error ? e.message : e}`);
    await alertDeliveryProblem({ id: row.id, restaurantId, externalOrderId: row.storeId }, {
      kind: `ninetynine-toggle-${closed ? 'pause' : 'online'}-${Date.now()}`,
      severity: 'HIGH',
      title: closed ? 'A 99Food não recebeu a pausa da loja' : 'A 99Food não recebeu a abertura da loja',
      message: closed
        ? 'A loja fechou no Gastrux, mas continua aberta na 99Food. Pause pela tela da 99Food no Gastrux ou pelo app da 99Food.'
        : 'A loja abriu no Gastrux, mas continua pausada na 99Food. Retome pela tela da 99Food no Gastrux ou pelo app da 99Food.',
    });
    return 'failed';
  }
}

/** Gastrux staff: links any store the app is authorized on (test store, "Não encontramos sua loja"); any environment */
export async function staffLink(restaurantId: unknown, appShopId: unknown) {
  assertConfigured();
  const id = typeof appShopId === 'string' || typeof appShopId === 'number' ? String(appShopId) : '';
  if (typeof restaurantId !== 'string' || !id) throw new NinetynineConnectError('Informe restaurantId e appShopId');
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { id: true } });
  if (!restaurant) throw new NinetynineConnectError('Restaurante não encontrado', 404);
  const shop = (await authorizedShops()).find((s) => String(s.app_shop_id) === id);
  if (!shop) throw new NinetynineConnectError('O Gastrux não tem autorização nesta loja da 99Food');
  const store = { appShopId: id, name: String(shop.shop_name ?? '') };
  await assertFree(restaurantId, id);
  const integration = await integrationRow(restaurantId);
  await link(integration.id, store);
  return { store };
}

