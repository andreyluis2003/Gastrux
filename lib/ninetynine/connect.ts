import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { recordAudit, type RestaurantMember } from '@/lib/auth/restaurant-role';
import { isPlatformStaffEmail } from '@/lib/admin/guard';
import { platformTeam } from '@/lib/agents/platform-team';
import { alertDeliveryProblem } from '@/lib/kds-integration';
import { isTierFeatureEnabled, restaurantTier } from '@/lib/tier-guard';
import { getAuthorizationUrl, listAuthorizedShops, ninetynineConfig, setStoreStatus, tokenFor, type AuthorizedShop } from './client';

/**
 * Connecting a restaurant to its 99Food store (plan 2026-11-09 99food, Task 6). The store admin authorizes the Gastrux app
 * on the 99Food authorization page; back here the restaurant picks its store among the authorized ones whose phone looks
 * like the restaurant's (or the owner's WhatsApp). That list is only a hint: Gastrux phones are self-declared, 99Food store
 * phones are public and the authorization page carries no state, so picking a store only records a link request; the
 * Gastrux staff confirms it (staffLink) after checking with the restaurant. A store (app_shop_id) belongs to one restaurant.
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
const NO_REQUEST = { linkRequestStoreId: null, linkRequestStoreName: null, linkRequestedAt: null, linkRequestedBy: null };
type StoreStateData = Partial<{
  linkRequestStoreId: string | null; linkRequestStoreName: string | null; linkRequestedAt: Date | null; linkRequestedBy: string | null;
  pausedUntil: Date | null;
}>;

/** Writes the 99Food-only state (its own table, ninetynine_store_states), creating the row on first use */
async function saveState(integrationId: string, data: StoreStateData) {
  await prisma.ninetynineStoreState.upsert({ where: { integrationId }, create: { integrationId, ...data }, update: data });
}

/** Where the Gastrux staff confirms the link requests */
export const STAFF_SCREEN = '/admin/platform/99food';
/** What the 99Food says while the store is paused (shopStatus sub_biz_status 2, lib/ninetynine/events.ts) */
export const PAUSED_ON_99FOOD = 'Loja pausada na 99Food';

type Store = { appShopId: string; name: string };

async function assertBusiness(restaurantId: string) {
  if (!isTierFeatureEnabled(await restaurantTier(restaurantId), 'deliveryPlatforms')) {
    throw new NinetynineConnectError('A 99Food integrada é do plano Business', 403, { upgradeUrl: '/pricing' });
  }
}

const configured = () => ninetynineConfig() !== null;

function assertConfigured() {
  if (!configured()) throw new NinetynineConnectError('A 99Food não está configurada neste servidor', 409);
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

/**
 * A Brazilian phone as area code + its last 8 digits: the country code 55 (only on 12/13-digit numbers, since 55 is also
 * an area code) and a leading trunk 0 are dropped, and the mobile ninth digit is tolerated. Anything that is not area
 * code + 8 or 9 digits matches nothing.
 */
export function phoneKey(phone: unknown): string | null {
  let digits = String(phone ?? '').replace(/\D/g, '').replace(/^0+/, '');
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) digits = digits.slice(2);
  if (digits.length !== 10 && digits.length !== 11) return null;
  return digits.slice(0, 2) + digits.slice(-8);
}

async function ourPhones(restaurantId: string): Promise<Set<string>> {
  const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { phone: true, ownerId: true } });
  const owner = r ? await prisma.user.findUnique({ where: { id: r.ownerId }, select: { whatsapp: true } }) : null;
  return new Set([phoneKey(r?.phone), phoneKey(owner?.whatsapp)].filter((p): p is string => !!p));
}

/** Authorized, bound stores whose phone matches ours (linked elsewhere or not) */
async function matchingShops(restaurantId: string): Promise<Store[]> {
  const phones = await ourPhones(restaurantId);
  if (phones.size === 0) return [];
  return (await authorizedShops())
    .filter((s) => Number(s.bound_flag) === 1)
    .filter((s) => (Array.isArray(s.shop_phone) ? s.shop_phone : []).some((p) => phones.has(phoneKey(p?.phone) ?? '')))
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
    await saveState(integrationId, { pausedUntil: null });
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
  // Linked: a pending request is answered (kept above when the token fails, so the staff can try again)
  await saveState(integrationId, NO_REQUEST);
}

/** Paused by hand from Gastrux (until the end of the day, like the 99Food pause) or paused on the 99Food itself */
function isPaused(row: { pausedUntil: Date | null | undefined; syncError: string | null }, now = new Date()) {
  return (!!row.pausedUntil && row.pausedUntil > now) || row.syncError === PAUSED_ON_99FOOD;
}

/** The end of the restaurant's local day: the 99Food pause (pause_time 4) lasts until then */
export function endOfLocalDay(timeZone: string, now = new Date()): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(now).map((p) => [p.type, p.value]),
  );
  const localAsUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const offset = localAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day + 1) - offset);
}

export async function ninetynineState(restaurantId: string) {
  const row = await prisma.deliveryIntegration.findUnique({
    where: where(restaurantId),
    select: {
      storeId: true, storeName: true, lastOrderAt: true, syncStatus: true, syncError: true,
      ninetynineState: { select: { pausedUntil: true, linkRequestStoreId: true, linkRequestStoreName: true, linkRequestedAt: true } },
    },
  });
  const st = row?.ninetynineState;
  const connected = !!row?.storeId;
  return {
    configured: configured(),
    available: isTierFeatureEnabled(await restaurantTier(restaurantId), 'deliveryPlatforms'),
    connected,
    store: connected ? { appShopId: row!.storeId!, name: row!.storeName ?? '' } : null,
    paused: connected && isPaused({ pausedUntil: st?.pausedUntil, syncError: row!.syncError }),
    status: connected ? { syncStatus: row!.syncStatus, syncError: row!.syncError } : null,
    lastOrderAt: row?.lastOrderAt ?? null,
    request: !connected && st?.linkRequestStoreId
      ? { appShopId: st.linkRequestStoreId, name: st.linkRequestStoreName ?? '', requestedAt: st.linkRequestedAt }
      : null,
  };
}

export async function startConnection(member: RestaurantMember) {
  await assertBusiness(member.restaurantId);
  assertConfigured();
  return { url: await getAuthorizationUrl() };
}

/** A hint only: the store the restaurant picks still waits for the Gastrux staff (see selectStore) */
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

/** Rings the Gastrux staff (PLATFORM_ADMIN_EMAILS only: the global ADMIN role never sees other restaurants) */
async function tellStaff(title: string, message: string, data: Record<string, string>) {
  for (const member of (await platformTeam()).filter((m) => isPlatformStaffEmail(m.email))) {
    await prisma.notification.create({
      data: {
        userId: member.id, restaurantId: member.currentRestaurantId, type: 'SYSTEM_INFO', severity: 'HIGH',
        title, message, actionUrl: STAFF_SCREEN, actionLabel: 'Abrir os pedidos', data: { kind: 'ninetynine_link_request', ...data },
      },
    }).catch((e) => console.error('[99food] could not ring the staff:', e));
  }
}

/**
 * The restaurant picks its store: only a link request is recorded (storeId stays null) and the Gastrux staff is rung;
 * the staff confirms it on the Plataforma screen (staffLink). It must be one of the listed stores, not linked elsewhere.
 */
export async function selectStore(member: RestaurantMember, appShopId: unknown) {
  await assertBusiness(member.restaurantId);
  assertConfigured();
  const id = typeof appShopId === 'string' || typeof appShopId === 'number' ? String(appShopId) : '';
  const current = await prisma.deliveryIntegration.findUnique({
    where: where(member.restaurantId), select: { storeId: true, ninetynineState: { select: { linkRequestStoreId: true, linkRequestStoreName: true, linkRequestedAt: true } } },
  });
  if (current?.storeId) throw new NinetynineConnectError('A loja da 99Food já está conectada', 409);
  // The same store asked again: the staff was already rung
  const pending = current?.ninetynineState;
  if (id && pending?.linkRequestStoreId === id) {
    return { request: { appShopId: id, name: pending.linkRequestStoreName ?? '', requestedAt: pending.linkRequestedAt } };
  }
  // Checked again now: the list on the screen may be old
  const store = id ? (await matchingShops(member.restaurantId)).find((s) => s.appShopId === id) : undefined;
  if (!store) throw new NinetynineConnectError('Escolha uma das lojas da lista');
  await assertFree(member.restaurantId, store.appShopId);
  const integration = await integrationRow(member.restaurantId);
  const requestedAt = new Date();
  await saveState(integration.id, { linkRequestStoreId: store.appShopId, linkRequestStoreName: store.name, linkRequestedAt: requestedAt, linkRequestedBy: member.userId });
  await recordAudit(member, { action: 'UPDATE', entityType: 'DeliveryIntegration', entityId: integration.id, changes: { ninetynine: 'link_requested', appShopId: store.appShopId } });
  const restaurant = await prisma.restaurant.findUnique({ where: { id: member.restaurantId }, select: { name: true } });
  await tellStaff(
    'Pedido para ligar loja da 99Food',
    `${restaurant?.name ?? 'Um restaurante'} pediu para ligar a loja "${store.name}" da 99Food (app_shop_id ${store.appShopId}).`,
    { restaurantId: member.restaurantId, appShopId: store.appShopId },
  );
  return { request: { appShopId: store.appShopId, name: store.name, requestedAt } };
}

/** The restaurant gives up its pending link request */
export async function cancelRequest(member: RestaurantMember) {
  const row = await prisma.deliveryIntegration.findUnique({ where: where(member.restaurantId), select: { id: true, ninetynineState: { select: { linkRequestStoreId: true } } } });
  const pending = row?.ninetynineState?.linkRequestStoreId;
  if (!row || !pending) return { request: null };
  await saveState(row.id, NO_REQUEST);
  await recordAudit(member, { action: 'UPDATE', entityType: 'DeliveryIntegration', entityId: row.id, changes: { ninetynine: 'link_request_cancelled', appShopId: pending } });
  return { request: null };
}

/**
 * Pause closes the store on the 99Food until the end of the day (or "Retomar"). The link stays on (isActive true): an
 * order the 99Food still sends during the pause comes in normally.
 */
export async function setPaused(member: RestaurantMember, paused: boolean) {
  await assertBusiness(member.restaurantId);
  assertConfigured();
  const row = await prisma.deliveryIntegration.findUnique({ where: where(member.restaurantId), select: { id: true, storeId: true } });
  if (!row?.storeId) throw new NinetynineConnectError('Conecte a loja da 99Food primeiro', 409);
  try {
    await setStoreStatus(row.id, paused ? 'pause' : 'online');
  } catch (e) {
    console.warn(`[99food] setStatus ${paused ? 'pause' : 'online'} failed: ${e instanceof Error ? e.message : e}`);
    throw new NinetynineConnectError(paused ? 'A 99Food não recebeu a pausa da loja: tente de novo' : 'A 99Food não recebeu a volta da loja: tente de novo', 502);
  }
  const restaurant = await prisma.restaurant.findUnique({ where: { id: member.restaurantId }, select: { timezone: true } });
  await saveState(row.id, { pausedUntil: paused ? endOfLocalDay(restaurant?.timezone || 'America/Sao_Paulo') : null });
  // resuming also clears what the 99Food last said about a pause; its next shopStatus sets the status again
  if (!paused) await prisma.deliveryIntegration.update({ where: { id: row.id }, data: { syncStatus: 'SUCCESS', syncError: null } });
  await recordAudit(member, { action: 'UPDATE', entityType: 'DeliveryIntegration', entityId: row.id, changes: { ninetynine: paused ? 'paused' : 'resumed' } });
  return { paused };
}

/** Clears the link and the token; the authorization itself is removed in the 99Food portal */
export async function disconnect(member: RestaurantMember) {
  const row = await prisma.deliveryIntegration.findUnique({ where: where(member.restaurantId), select: { id: true, storeId: true } });
  if (!row) return { connected: false };
  await prisma.deliveryIntegration.update({
    where: { id: row.id },
    data: {
      isActive: false, storeId: null, storeName: null, oauthAccessToken: null, oauthRefreshToken: null, oauthExpiresAt: null, oauthVerifier: null,
    },
  });
  await saveState(row.id, { pausedUntil: null, ...NO_REQUEST });
  await recordAudit(member, { action: 'UPDATE', entityType: 'DeliveryIntegration', entityId: row.id, changes: { ninetynine: 'disconnected', appShopId: row.storeId } });
  return { connected: false };
}

async function pushStoreToggle(row: { id: string; storeId: string }, restaurantId: string, closed: boolean) {
  try {
    await setStoreStatus(row.id, closed ? 'pause' : 'online');
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
  }
}

/**
 * The store toggle (Loja aberta/fechada): closing pauses a linked 99Food store; opening puts it back online. A store
 * paused by hand on the 99Food screen of Gastrux (pausedUntil ahead) is left alone. The 99Food call runs in the
 * background, after the Gastrux state is saved: the toggle never waits for it; a failure goes to the sino.
 * Returns 'pending' when the call was started.
 */
export async function followStoreToggle(restaurantId: string, closed: boolean): Promise<null | 'pending'> {
  if (!configured()) return null;
  const row = await prisma.deliveryIntegration.findUnique({ where: where(restaurantId), select: { id: true, storeId: true, isActive: true, ninetynineState: { select: { pausedUntil: true } } } });
  if (!row?.storeId || !row.isActive) return null;
  const pausedUntil = row.ninetynineState?.pausedUntil;
  if (pausedUntil && pausedUntil > new Date()) return null;
  void pushStoreToggle({ id: row.id, storeId: row.storeId }, restaurantId, closed).catch((e) => console.error('[99food] store toggle:', e));
  return 'pending';
}

/** Gastrux staff: the restaurants waiting for their 99Food store to be confirmed, oldest first */
export async function linkRequests() {
  const rows = (await prisma.ninetynineStoreState.findMany({
    where: { linkRequestStoreId: { not: null }, integration: { platform: PLATFORM } },
    orderBy: { linkRequestedAt: 'asc' },
    select: {
      linkRequestStoreId: true, linkRequestStoreName: true, linkRequestedAt: true, linkRequestedBy: true,
      integration: { select: { restaurantId: true, restaurant: { select: { name: true, phone: true } } } },
    },
    take: 200,
  })).map((r) => ({ ...r, restaurantId: r.integration.restaurantId, restaurant: r.integration.restaurant }));
  const userIds = rows.map((r) => r.linkRequestedBy).filter((u): u is string => !!u);
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true, whatsapp: true } }) : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  return rows.map((r) => {
    const u = r.linkRequestedBy ? byId.get(r.linkRequestedBy) : undefined;
    return {
      restaurantId: r.restaurantId, restaurantName: r.restaurant.name, restaurantPhone: r.restaurant.phone,
      appShopId: r.linkRequestStoreId!, storeName: r.linkRequestStoreName ?? '', requestedAt: r.linkRequestedAt,
      requestedBy: u ? { name: u.name, email: u.email, whatsapp: u.whatsapp } : null,
    };
  });
}

/** Gastrux staff: refuses a pending request and tells the restaurant */
export async function refuseRequest(restaurantId: unknown) {
  if (typeof restaurantId !== 'string' || !restaurantId) throw new NinetynineConnectError('Informe restaurantId');
  const integ = await prisma.deliveryIntegration.findUnique({
    where: where(restaurantId), select: { id: true, ninetynineState: { select: { linkRequestStoreId: true, linkRequestStoreName: true } } },
  });
  const row = integ?.ninetynineState;
  if (!integ || !row?.linkRequestStoreId) throw new NinetynineConnectError('Este restaurante não tem pedido pendente', 404);
  await saveState(integ.id, NO_REQUEST);
  await alertDeliveryProblem({ id: integ.id, restaurantId, externalOrderId: row.linkRequestStoreId }, {
    kind: `ninetynine-link-refused-${Date.now()}`,
    severity: 'HIGH',
    title: 'A equipe Gastrux não confirmou a loja da 99Food: fale com o suporte',
    message: `A loja "${row.linkRequestStoreName ?? ''}" da 99Food não foi ligada a este restaurante. Fale com o suporte do Gastrux pelo chat.`,
  });
  return { refused: true };
}

/**
 * Gastrux staff: links any store the app is authorized on (confirming a request, the test store, "Não encontramos sua
 * loja"); any environment. Clears the restaurant's pending request.
 */
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
