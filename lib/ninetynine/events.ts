import { prisma } from '@/lib/prisma';
import type { NinetynineEvent } from '@prisma/client';
import { restaurantAcceptsOrders } from '@/lib/billing/order-gate';
import { isTierFeatureEnabled, restaurantTier } from '@/lib/tier-guard';
import { canMoveExternalOrderStatus } from '@/lib/delivery-integration/external-order-status';
import { alertDeliveryProblem } from '@/lib/kds-integration';
import { cancelOrder } from '@/lib/kds-cancel-order';
import { DeliveryOrderError, acceptDeliveryOrder, externalItemsJson, ingestDeliveryOrder, itemsSubtotal } from '@/lib/delivery-orders/ingest';
import { pushPlatformStatus } from '@/lib/delivery-orders/platform-sync';
import { getOrderDetail } from './client';
import { mapNinetynineOrder } from './order-map';

/**
 * The stored 99Food webhook events become delivery orders and status changes (plan 2026-11-09 99food, Task 4). The
 * webhook only stores (lib/ninetynine/events-store.ts); this processes the oldest due rows, one server process at a time
 * (lease). A failure is retried with backoff until it no longer matters: an orderNew gives up at 4.5 minutes (99Food
 * cancels an order not confirmed in 5), any other event at 30 minutes.
 */
const PLATFORM = 'ninety_nine_food' as const;
const BATCH = 50;
const MAX_BATCHES = 20;
const CONFIRM_WINDOW_MS = 5 * 60_000;
const SECOND_ALERT_MS = 3 * 60_000;
const CANCEL_APPLY_MS = 5 * 60_000;
const REFUND_APPLY_MS = 25 * 3600_000;
const KEEP_MS = 30 * 86400_000;
const CLEANUP_EVERY_MS = 24 * 3600_000;
const AFTER_RUN_EVERY_MS = 30_000;
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 60_000;
const GIVE_UP_ORDER_NEW_MS = 4.5 * 60_000;
const GIVE_UP_OTHER_MS = 30 * 60_000;
/** A run stops taking rows after this, well inside the 120 s lease */
const RUN_BUDGET_MS = 90_000;
const LEASE_WHILE_RUNNING_MS = 120_000;
/** The note of an order event that came before its orderNew: re-queued when the orderNew lands */
const NOT_IN_YET = 'pedido ainda não está no Gastrux';
const ORDER_EVENTS = ['orderConfirm', 'orderReady', 'orderFinish', 'orderCancel', 'orderPartialCancel', 'orderCancelApply', 'orderRefundApply'];

type Linked = { id: string; restaurantId: string; storeId: string };
type Ext = { id: string; restaurantId: string; externalOrderId: string; status: any; platformData: unknown; integrationId: string; disputeId: string | null; specialInstructions: string | null; internalOrder: { id: string; status: string; specialInstructions: string | null } | null };

/** The event was handled with nothing to do: kept as processed with this note */
class Skip extends Error {}

const SHOP_STATUS: Record<number, { status: 'SUCCESS' | 'PARTIAL' | 'FAILED'; text: string | null }> = {
  1: { status: 'SUCCESS', text: null },
  // the same text as PAUSED_ON_99FOOD in ./connect: the screen shows "Pausada" from it
  2: { status: 'PARTIAL', text: 'Loja pausada na 99Food' },
  3: { status: 'PARTIAL', text: 'Loja fechada na 99Food' },
  4: { status: 'FAILED', text: 'Loja desconectada da 99Food' },
  5: { status: 'PARTIAL', text: 'Loja fora do horário na 99Food' },
  6: { status: 'FAILED', text: 'Loja bloqueada pela 99Food' },
  7: { status: 'PARTIAL', text: 'Sem entregadores da 99Food agora' },
};

async function eligible(restaurantId: string): Promise<boolean> {
  if (!(await restaurantAcceptsOrders(restaurantId))) return false;
  return isTierFeatureEnabled(await restaurantTier(restaurantId), 'deliveryPlatforms');
}

async function integrationOf(appShopId: string | null) {
  if (!appShopId) return null;
  return prisma.deliveryIntegration.findFirst({
    where: { platform: PLATFORM, storeId: appShopId },
    select: { id: true, restaurantId: true, storeId: true, isActive: true },
  });
}

const displayOf = (ext: { platformData: unknown; externalOrderId: string }) => {
  const idx = ((ext.platformData ?? {}) as { orderIndex?: number }).orderIndex;
  return idx ? String(idx) : ext.externalOrderId.slice(-6);
};

const tsOf = (payload: any): number => {
  const t = Number(payload?.timestamp);
  if (!Number.isFinite(t) || t <= 0) return Date.now();
  return t < 1e12 ? t * 1000 : t;
};

async function moveForward(ext: { id: string; status: any }, target: any, message: string) {
  if (!canMoveExternalOrderStatus(ext.status, target)) return;
  const moved = await prisma.externalOrder.updateMany({ where: { id: ext.id, status: ext.status }, data: { status: target, ...(target === 'DELIVERED' ? { deliveredAt: new Date() } : {}) } });
  if (moved.count) {
    await prisma.deliveryLog.create({ data: { externalOrderId: ext.id, eventType: 'STATUS_CHANGED', previousStatus: ext.status, newStatus: target, message, eventTimestamp: new Date() } }).catch(() => {});
  }
}

const EXT_SELECT = {
  id: true, restaurantId: true, externalOrderId: true, status: true, platformData: true, integrationId: true, disputeId: true, specialInstructions: true,
  internalOrder: { select: { id: true, status: true, specialInstructions: true } },
} as const;

async function findExt(integration: { id: string; restaurantId: string }, orderId: string): Promise<Ext | null> {
  const ext = await prisma.externalOrder.findUnique({
    where: { restaurantId_externalOrderId: { restaurantId: integration.restaurantId, externalOrderId: orderId } },
    select: EXT_SELECT,
  });
  return ext && ext.integrationId === integration.id ? (ext as Ext) : null;
}

async function orderNew(row: NinetynineEvent, appShopId: string | null, orderId: string) {
  // The plan gate applies to new orders only: later events of an order already in Gastrux are always followed
  const found = await integrationOf(appShopId);
  if (!found) throw new Skip('loja da 99Food não ligada a nenhum restaurante');
  // isActive is off only when the link is gone (disconnect, unbind); a pause never turns it off, so an order the
  // 99Food still sends while paused comes in
  if (!found.isActive) throw new Skip('integração da 99Food desligada');
  if (!(await eligible(found.restaurantId))) throw new Skip('o plano do restaurante não recebe pedidos de plataformas');
  const integration = found as Linked;

  const data = (row.payload as any)?.data ?? {};
  let info = data.order_info;
  if (!info || typeof info !== 'object') info = (await getOrderDetail(integration.id, orderId)).order_info;
  const m = mapNinetynineOrder({ ...info, order_id: orderId });
  let duplicate = true;
  try {
    const res = await ingestDeliveryOrder({
      restaurantId: integration.restaurantId, integrationId: integration.id, platform: PLATFORM,
      input: m.input, extraNote: m.extraNote, platformData: m.platformData,
    });
    duplicate = res.duplicate;
  } catch (e) {
    // The code clashes with another origin's order: retrying would never help
    if (!(e instanceof DeliveryOrderError)) throw e;
    throw new Skip(`pedido recusado: ${e.message}`);
  }
  if (!duplicate) {
    await prisma.deliveryIntegration.update({ where: { id: integration.id }, data: { lastOrderAt: new Date(), totalOrdersSynced: { increment: 1 } } }).catch(() => {});
  }
  const ext = await prisma.externalOrder.findUnique({
    where: { restaurantId_externalOrderId: { restaurantId: integration.restaurantId, externalOrderId: orderId } },
    select: { id: true, externalOrderId: true, status: true, integrationId: true, platformConfirmedAt: true },
  });
  // Accepted at once (auto-accept): the accept already told 99Food; a confirm that failed there is tried again here
  if (ext && ext.status === 'CONFIRMED' && !ext.platformConfirmedAt) await pushPlatformStatus(ext.id, 'confirm');
  // Events of this order that came first and found nothing go back to the queue (the run picks them up next)
  await prisma.ninetynineEvent.updateMany({
    where: { orderId, type: { in: ORDER_EVENTS }, processedAt: { not: null }, error: { startsWith: NOT_IN_YET } },
    data: { processedAt: null, error: null, nextAttemptAt: null },
  });
}

async function orderCancelled(ext: Ext) {
  const kitchen = ext.internalOrder;
  const doneAlert = () => alertDeliveryProblem(ext, {
    kind: 'ninetynine-cancelled-after-done', severity: 'CRITICAL', title: 'A 99Food cancelou um pedido já concluído',
    message: `A 99Food cancelou o pedido #${displayOf(ext)}, que a cozinha já concluiu. A venda continua no Caixa: confira com a 99Food.`,
  });
  if (kitchen?.status === 'COMPLETED') return doneAlert();
  let changed = false;
  if (kitchen && kitchen.status !== 'CANCELLED') {
    const outcome = await cancelOrder(kitchen.id, { restaurantId: ext.restaurantId, reason: 'Cancelado pela 99Food', fromPlatform: true });
    if (outcome.kind === 'completed') return doneAlert();
    changed = true;
  }
  const moved = await prisma.externalOrder.updateMany({
    where: { id: ext.id, status: { notIn: ['CANCELLED', 'REJECTED', 'DELIVERED'] } },
    data: { status: 'CANCELLED', disputeId: null, disputeExpiresAt: null },
  });
  // The kitchen cancel already moves the order to CANCELLED: either change rings
  if (changed || moved.count) {
    await alertDeliveryProblem(ext, {
      kind: 'ninetynine-cancelled', severity: 'HIGH', title: 'A 99Food cancelou um pedido',
      message: `A 99Food cancelou o pedido #${displayOf(ext)}.`,
    });
  }
}

async function applyDispute(row: NinetynineEvent, ext: Ext, kind: 'cancel' | 'refund') {
  const data = (row.payload as any)?.data ?? {};
  const applyId = data.apply_id != null ? String(data.apply_id) : null;
  if (!applyId) throw new Skip('pedido sem apply_id');
  // A resend of the same request changes nothing and does not ring again
  if (ext.disputeId === applyId) return;
  const reasons = kind === 'cancel' ? data.reason_list ?? [] : data.base_reason_list ?? [];
  const platformData = {
    ...((ext.platformData ?? {}) as object),
    disputeKind: kind,
    disputeReason: typeof data.apply_reason === 'string' ? data.apply_reason.slice(0, 300) : null,
    disputeReasons: Array.isArray(reasons) ? reasons : [],
  };
  await prisma.externalOrder.update({
    where: { id: ext.id },
    data: { disputeId: applyId, disputeExpiresAt: new Date(tsOf(row.payload) + (kind === 'cancel' ? CANCEL_APPLY_MS : REFUND_APPLY_MS)), platformData },
  });
  await alertDeliveryProblem(ext, kind === 'cancel'
    ? { kind: `ninetynine-dispute-${applyId}`, severity: 'HIGH', title: 'Pedido de cancelamento na 99Food', message: `O cliente pediu para cancelar o pedido 99Food #${displayOf(ext)}: responda em Pedidos de delivery.` }
    : { kind: `ninetynine-dispute-${applyId}`, severity: 'HIGH', title: 'Pedido de devolução na 99Food', message: `O cliente pediu devolução do pedido 99Food #${displayOf(ext)}: responda em Pedidos de delivery.` });
}

const withLine = (text: string | null, line: string) => (text?.split('\n').includes(line) ? text : [text, line].filter(Boolean).join('\n'));

/** 99Food took items out: the order's items and values follow the new detail; the kitchen ticket gets the note */
async function partialCancel(row: NinetynineEvent, ext: Ext) {
  const detail = await getOrderDetail(ext.integrationId, ext.externalOrderId);
  const m = mapNinetynineOrder({ ...detail.order_info, order_id: ext.externalOrderId });
  const left = m.input.itens.map((it) => `${it.quantidade}x ${it.nome}`).join(', ') || 'nenhum item';
  const line = `A 99Food tirou itens: ficou ${left}`;
  const subtotal = itemsSubtotal(m.input.itens);
  await prisma.externalOrder.update({
    where: { id: ext.id },
    data: {
      items: externalItemsJson(m.input.itens), subtotal, totalAmount: m.input.total, deliveryFee: m.input.taxaEntrega, discount: m.input.desconto,
      specialInstructions: withLine(ext.specialInstructions, line),
    },
  });
  const kitchen = ext.internalOrder;
  if (kitchen && kitchen.status !== 'COMPLETED' && kitchen.status !== 'CANCELLED') {
    // Same convention as the kitchen order's creation: total = items + delivery fee, the discount apart
    await prisma.order.update({
      where: { id: kitchen.id },
      data: { subtotal, fees: m.input.taxaEntrega, discount: m.input.desconto, total: subtotal + m.input.taxaEntrega, specialInstructions: withLine(kitchen.specialInstructions, line) },
    });
  }
  await alertDeliveryProblem(ext, {
    kind: `ninetynine-partial-${ext.externalOrderId}-${String((row.payload as any)?.timestamp ?? row.id)}`, severity: 'HIGH',
    title: 'A 99Food tirou itens de um pedido', message: `A 99Food tirou itens do pedido #${displayOf(ext)}`,
  });
}

async function shopBind(row: NinetynineEvent) {
  const data = (row.payload as any)?.data ?? {};
  const ids: string[] = Array.isArray(data.appShopIDList) ? data.appShopIDList.map(String) : [];
  if (data.bindStatus !== 'unbind') {
    // Linking happens on the integration screen (Task 6)
    console.log(`[99food] shopBindStatus ${String(data.bindStatus)} ${ids.join(',')}`);
    return;
  }
  for (const id of ids) {
    const integ = await integrationOf(id);
    if (!integ) continue;
    await prisma.deliveryIntegration.update({
      where: { id: integ.id },
      data: { isActive: false, storeId: null, storeName: null, oauthAccessToken: null, oauthRefreshToken: null, oauthExpiresAt: null },
    });
    await alertDeliveryProblem({ id: integ.id, restaurantId: integ.restaurantId, externalOrderId: id }, {
      kind: `ninetynine-unbind-${row.id}`, severity: 'HIGH', title: 'Loja da 99Food desligada',
      message: 'A loja da 99Food foi desligada do Gastrux',
    });
  }
}

async function shopStatus(row: NinetynineEvent) {
  const integ = await integrationOf(row.appShopId);
  if (!integ) throw new Skip('loja da 99Food não ligada a nenhum restaurante');
  const sub = Number((row.payload as any)?.data?.sub_biz_status);
  const s = SHOP_STATUS[sub];
  if (!s) throw new Skip(`sub_biz_status desconhecido: ${sub}`);
  // Online on the 99Food: a pause made from Gastrux is over (resumed in the 99Food app)
  await prisma.deliveryIntegration.update({ where: { id: integ.id }, data: { syncStatus: s.status, syncError: s.text } });
  if (sub === 1) await prisma.ninetynineStoreState.updateMany({ where: { integrationId: integ.id }, data: { pausedUntil: null } });
}

const orderIdOf = (row: NinetynineEvent) => {
  if (row.orderId) return row.orderId;
  const id = (row.payload as any)?.data?.order_id;
  return id != null ? String(id) : null;
};

/** Does the work of one event; throws Skip (nothing to do) or any other error (retry) */
async function handle(row: NinetynineEvent): Promise<void> {
  const type = row.type;
  if (type === 'shopBindStatus') return shopBind(row);
  if (type === 'shopStatus') return shopStatus(row);

  const orderId = orderIdOf(row);
  if (!orderId) throw new Skip(`evento ${type} sem order_id`);
  if (type === 'orderNew') return orderNew(row, row.appShopId, orderId);

  const integration = await integrationOf(row.appShopId);
  if (!integration) throw new Skip('loja da 99Food não ligada a nenhum restaurante');
  const ext = await findExt(integration, orderId);
  if (!ext) {
    // Its orderNew has not been processed yet (failed or still queued): wait for it
    const waiting = await prisma.ninetynineEvent.findFirst({ where: { orderId, type: 'orderNew', processedAt: null }, select: { id: true } });
    if (waiting) throw new Error(`pedido ${orderId} ainda não entrou: o evento ${type} espera o orderNew`);
    throw new Skip(NOT_IN_YET);
  }

  switch (type) {
    case 'orderConfirm':
      // Confirmed in the 99Food app: Gastrux follows, without confirming again
      if (ext.status === 'PENDING') await acceptDeliveryOrder(ext.restaurantId, ext.id, { fromPlatform: true });
      await prisma.externalOrder.updateMany({ where: { id: ext.id, platformConfirmedAt: null }, data: { platformConfirmedAt: new Date() } });
      return;
    case 'orderReady':
      return moveForward(ext, 'READY', '99Food: pedido pronto');
    case 'orderFinish':
      return moveForward(ext, 'DELIVERED', '99Food: pedido concluído');
    case 'orderCancel':
      return orderCancelled(ext);
    case 'orderPartialCancel':
      return partialCancel(row, ext);
    case 'orderCancelApply':
      return applyDispute(row, ext, 'cancel');
    case 'orderRefundApply':
      return applyDispute(row, ext, 'refund');
    default:
      throw new Skip(`evento ${type} sem ação`);
  }
}

/** Processes one stored event and marks it processed; throws when it should be retried */
export async function processNinetynineEvent(row: NinetynineEvent): Promise<void> {
  let note: string | null = null;
  try {
    await handle(row);
  } catch (e) {
    if (!(e instanceof Skip)) throw e;
    note = e.message.slice(0, 300);
  }
  await prisma.ninetynineEvent.update({ where: { id: row.id }, data: { processedAt: new Date(), error: note, nextAttemptAt: null } });
}

async function failed(row: NinetynineEvent, e: any) {
  const message = String(e?.message ?? e).slice(0, 300);
  const now = Date.now();
  const limit = row.receivedAt.getTime() + (row.type === 'orderNew' ? GIVE_UP_ORDER_NEW_MS : GIVE_UP_OTHER_MS);
  const giveUp = now >= limit;
  // Backoff 5 s, 10 s, 20 s ... up to 60 s; the last try lands on the give-up moment, never after it
  const next = Math.min(now + Math.min(BACKOFF_BASE_MS * 2 ** row.attempts, BACKOFF_MAX_MS), limit);
  console.error(`[99food] event ${row.type} ${row.id} failed (${row.attempts + 1}):`, message);
  await prisma.ninetynineEvent.update({
    where: { id: row.id },
    data: { attempts: { increment: 1 }, error: message, ...(giveUp ? { processedAt: new Date(), nextAttemptAt: null } : { nextAttemptAt: new Date(next) }) },
  }).catch(() => {});
  if (!giveUp) return;
  const integ = await integrationOf(row.appShopId).catch(() => null);
  if (!integ) return;
  const pseudo = { id: `event:${row.id}`, restaurantId: integ.restaurantId, externalOrderId: row.orderId ?? '-' };
  if (row.type === 'orderNew') {
    await alertDeliveryProblem(pseudo, {
      kind: 'ninetynine-order-not-in', severity: 'CRITICAL', title: 'Pedido da 99Food não entrou no Gastrux',
      message: `Não conseguimos receber o pedido ${row.orderId ?? ''} da 99Food. Confirme no app da 99Food para não perder o pedido.`,
    });
    return;
  }
  await alertDeliveryProblem(pseudo, {
    kind: 'ninetynine-event-failed', severity: 'CRITICAL', title: 'Um aviso da 99Food não foi processado',
    message: row.orderId
      ? `Não conseguimos processar um aviso da 99Food (${row.type}) do pedido ${row.orderId}. Confira o pedido no app da 99Food.`
      : `Não conseguimos processar um aviso da 99Food (${row.type}). Confira a loja no app da 99Food.`,
  });
}

/** A confirm that did not reach 99Food is retried while it matters; a waiting order rings again at 3 min */
async function afterRun() {
  const rows = await prisma.deliveryIntegration.findMany({ where: { platform: PLATFORM, isActive: true, storeId: { not: null } }, select: { id: true, restaurantId: true } });
  const ids: string[] = [];
  for (const r of rows) if (await eligible(r.restaurantId)) ids.push(r.id);
  if (!ids.length) return;
  const now = Date.now();
  const unconfirmed = await prisma.externalOrder.findMany({
    where: { integrationId: { in: ids }, status: 'CONFIRMED', platformConfirmedAt: null, orderReceivedAt: { gte: new Date(now - CONFIRM_WINDOW_MS) } },
    select: { id: true, externalOrderId: true, status: true, integrationId: true },
  });
  for (const o of unconfirmed) await pushPlatformStatus(o.id, 'confirm');

  const waiting = await prisma.externalOrder.findMany({
    where: { integrationId: { in: ids }, status: 'PENDING', orderReceivedAt: { lte: new Date(now - SECOND_ALERT_MS), gte: new Date(now - CONFIRM_WINDOW_MS) } },
    select: { id: true, restaurantId: true, externalOrderId: true, platformData: true },
  });
  for (const o of waiting) {
    await alertDeliveryProblem(o, {
      kind: 'ninetynine-waiting-2', severity: 'HIGH', title: 'Pedido da 99Food esperando',
      message: `Pedido da 99Food #${displayOf(o)} esperando há 3 min — confirme antes de 5 min`,
    });
  }
}

let lastCleanupAt = 0;
let lastAfterRunAt = 0;

async function cleanup() {
  if (Date.now() - lastCleanupAt < CLEANUP_EVERY_MS) return;
  lastCleanupAt = Date.now();
  await prisma.ninetynineEvent.deleteMany({ where: { processedAt: { not: null }, receivedAt: { lt: new Date(Date.now() - KEEP_MS) } } }).catch((e) => {
    console.error('[99food] cleanup failed:', e?.message ?? e);
  });
}

const LEASE = 'ninetynine-events';

/** Only one server process processes at a time; the lease's own expiry is the owner's mark for the release */
async function takeLease(): Promise<string | null> {
  const rows = await prisma.$queryRaw<Array<{ until: string }>>`
    INSERT INTO "poll_leases" ("name", "leaseUntil") VALUES (${LEASE}, now() + ${LEASE_WHILE_RUNNING_MS} * interval '1 millisecond')
    ON CONFLICT ("name") DO UPDATE SET "leaseUntil" = EXCLUDED."leaseUntil"
    WHERE "poll_leases"."leaseUntil" < now()
    RETURNING "leaseUntil"::text AS until`;
  return rows[0]?.until ?? null;
}

/** Released only while still ours: a run that overran its lease never cuts another process's lease short */
async function releaseLease(ours: string, holdMs: number) {
  await prisma.$executeRaw`UPDATE "poll_leases" SET "leaseUntil" = now() + ${holdMs} * interval '1 millisecond'
    WHERE "name" = ${LEASE} AND "leaseUntil"::text = ${ours}`.catch(() => {});
}

/**
 * One run: the due events oldest first (batches of 50 until none is due or 90 s pass), then (every 30 s, or always with
 * `sweep`) the confirm retry and the 3-minute alert. `holdMs`: how long the lease is kept after the run.
 */
export async function processPendingOnce(opts: { holdMs?: number; sweep?: boolean } = {}): Promise<{ processed: number; failed: number }> {
  const ours = await takeLease();
  if (!ours) return { processed: 0, failed: 0 };
  const started = Date.now();
  try {
    await cleanup();
    const result = { processed: 0, failed: 0 };
    for (let batch = 0; batch < MAX_BATCHES && Date.now() - started < RUN_BUDGET_MS; batch++) {
      const rows = await prisma.ninetynineEvent.findMany({
        where: { processedAt: null, OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }] },
        orderBy: { receivedAt: 'asc' },
        take: BATCH,
      });
      if (!rows.length) break;
      for (const row of rows) {
        if (Date.now() - started >= RUN_BUDGET_MS) break;
        try {
          await processNinetynineEvent(row);
          result.processed++;
        } catch (e) {
          result.failed++;
          await failed(row, e);
        }
      }
    }
    if (opts.sweep || Date.now() - lastAfterRunAt >= AFTER_RUN_EVERY_MS) {
      lastAfterRunAt = Date.now();
      await afterRun();
    }
    return result;
  } finally {
    await releaseLease(ours, opts.holdMs ?? 0);
  }
}
