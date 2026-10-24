import { prisma } from '@/lib/prisma';
import { restaurantAcceptsOrders } from '@/lib/billing/order-gate';
import { isTierFeatureEnabled, restaurantTier } from '@/lib/tier-guard';
import { canMoveExternalOrderStatus } from '@/lib/delivery-integration/external-order-status';
import { alertDeliveryProblem } from '@/lib/kds-integration';
import { cancelOrder } from '@/lib/kds-cancel-order';
import { DeliveryOrderError, acceptDeliveryOrder, ingestDeliveryOrder } from '@/lib/delivery-orders/ingest';
import { pushPlatformStatus } from '@/lib/delivery-orders/platform-sync';
import { ackEvents, getOrder, ifoodMode, pollEvents, type IfoodEventPayload } from './client';
import { mapIfoodOrder } from './order-map';

/**
 * One poll of the iFood events (plan 2026-10-24 ifood, Task 5). Every event is stored by its id first (a repeated
 * event is processed once), processed, and acknowledged only after that: a failure stays unacknowledged and iFood
 * repeats it on the next poll. Polling is also what keeps the store "connected" (open) on iFood.
 */
const MERCHANTS_PER_POLL = 100;
const CONFIRM_WINDOW_MS = 8 * 60_000;
const SECOND_ALERT_MS = 5 * 60_000;

type Linked = { id: string; restaurantId: string; storeId: string };

async function linkedIntegrations(): Promise<Linked[]> {
  const rows = await prisma.deliveryIntegration.findMany({
    where: { platform: 'ifood', isActive: true, storeId: { not: null } },
    select: { id: true, restaurantId: true, storeId: true },
  });
  const allowed: Linked[] = [];
  for (const r of rows) {
    // Business only, and never while the plan is locked: no polling closes the store on iFood
    if (!(await restaurantAcceptsOrders(r.restaurantId))) continue;
    if (!isTierFeatureEnabled(await restaurantTier(r.restaurantId), 'deliveryPlatforms')) continue;
    allowed.push(r as Linked);
  }
  return allowed;
}

const displayOf = (ext: { platformData: unknown; externalOrderId: string }) =>
  ((ext.platformData ?? {}) as { displayId?: string }).displayId ?? ext.externalOrderId.slice(-6);

const FROM_OTHER_SYSTEM: Record<string, 'PREPARING' | 'READY' | 'PICKED_UP'> = { SPS: 'PREPARING', RTP: 'READY', DSP: 'PICKED_UP' };

async function moveForward(ext: { id: string; status: any }, target: any, message: string) {
  if (!canMoveExternalOrderStatus(ext.status, target)) return;
  const moved = await prisma.externalOrder.updateMany({ where: { id: ext.id, status: ext.status }, data: { status: target, ...(target === 'DELIVERED' ? { deliveredAt: new Date() } : {}) } });
  if (moved.count) {
    await prisma.deliveryLog.create({ data: { externalOrderId: ext.id, eventType: 'STATUS_CHANGED', previousStatus: ext.status, newStatus: target, message, eventTimestamp: new Date() } }).catch(() => {});
  }
}

export async function processIfoodEvent(ev: IfoodEventPayload, integration: Linked | null): Promise<void> {
  // A store not linked to any restaurant (or a locked one): never an order in another restaurant
  if (!integration) return;
  const code = ev.code;
  if (code === 'PLC') {
    if (!ev.orderId) return;
    const order = await getOrder(integration, ev.orderId);
    const m = mapIfoodOrder(order);
    try {
      await ingestDeliveryOrder({
        restaurantId: integration.restaurantId, integrationId: integration.id, platform: 'ifood',
        input: m.input, extraNote: m.extraNote, platformData: m.platformData, externalCustomerId: m.externalCustomerId,
      });
    } catch (e) {
      // The code clashes with another origin's order: retrying would never help
      if (!(e instanceof DeliveryOrderError)) throw e;
      console.error('[ifood] order refused by the pipeline:', e.message);
    }
    await prisma.deliveryIntegration.update({ where: { id: integration.id }, data: { lastOrderAt: new Date(), totalOrdersSynced: { increment: 1 } } }).catch(() => {});
    return;
  }

  if (!ev.orderId) return;
  const ext = await prisma.externalOrder.findUnique({
    where: { restaurantId_externalOrderId: { restaurantId: integration.restaurantId, externalOrderId: ev.orderId } },
    select: { id: true, restaurantId: true, externalOrderId: true, status: true, platformData: true, integrationId: true, internalOrder: { select: { id: true, status: true } } },
  });
  if (!ext || ext.integrationId !== integration.id) return;

  if (code === 'CFM') {
    // Confirmed on iFood by another system (the iFood order manager): Gastrux follows, without confirming again
    if (ext.status === 'PENDING') await acceptDeliveryOrder(ext.restaurantId, ext.id, { fromPlatform: true });
    await prisma.externalOrder.updateMany({ where: { id: ext.id, platformConfirmedAt: null }, data: { platformConfirmedAt: new Date() } });
    return;
  }
  if (FROM_OTHER_SYSTEM[code]) return moveForward(ext, FROM_OTHER_SYSTEM[code], `iFood: ${ev.fullCode ?? code}`);
  if (code === 'CON') return moveForward(ext, 'DELIVERED', 'iFood: pedido concluído');

  if (code === 'CAN') {
    const kitchen = ext.internalOrder;
    if (kitchen?.status === 'COMPLETED') {
      await alertDeliveryProblem(ext, {
        kind: 'ifood-cancelled-after-done', severity: 'CRITICAL', title: 'O iFood cancelou um pedido já concluído',
        message: `O iFood cancelou o pedido #${displayOf(ext)}, que a cozinha já concluiu. A venda continua no Caixa: confira com o iFood.`,
      });
      return;
    }
    if (kitchen && kitchen.status !== 'CANCELLED') {
      await cancelOrder(kitchen.id, { restaurantId: ext.restaurantId, reason: 'Cancelado pelo iFood', fromPlatform: true });
    }
    await prisma.externalOrder.updateMany({ where: { id: ext.id, status: { notIn: ['CANCELLED', 'REJECTED', 'DELIVERED'] } }, data: { status: 'CANCELLED', disputeId: null, disputeExpiresAt: null } });
    return;
  }

  if (code === 'HSD') {
    const meta = ev.metadata ?? {};
    const disputeId = String(meta.disputeId ?? meta.id ?? ev.id);
    const expires = meta.expiresAt ? new Date(meta.expiresAt) : null;
    await prisma.externalOrder.update({ where: { id: ext.id }, data: { disputeId, disputeExpiresAt: expires && !Number.isNaN(expires.getTime()) ? expires : null } });
    await alertDeliveryProblem(ext, {
      kind: `ifood-dispute-${disputeId}`, severity: 'HIGH', title: 'Pedido de cancelamento no iFood',
      message: `O cliente pediu para cancelar o pedido iFood #${displayOf(ext)}: responda em Pedidos de delivery.`,
    });
    return;
  }
  if (code === 'HSS') {
    await prisma.externalOrder.update({ where: { id: ext.id }, data: { disputeId: null, disputeExpiresAt: null } });
    return;
  }
  if (code === 'CARF') {
    await alertDeliveryProblem(ext, {
      kind: `ifood-cancel-failed-${ev.id}`, severity: 'HIGH', title: 'O iFood não aceitou o cancelamento',
      message: `O iFood não aceitou o cancelamento do pedido #${displayOf(ext)}. O pedido continua valendo.`,
    });
  }
  // Any other event: stored and acknowledged, nothing to do
}

async function afterPoll(polled: Linked[]) {
  const ids = polled.map((p) => p.id);
  if (!ids.length) return;
  const now = Date.now();
  // A confirm that did not reach iFood is retried while it still matters (iFood cancels after 8 minutes)
  const unconfirmed = await prisma.externalOrder.findMany({
    where: { integrationId: { in: ids }, status: 'CONFIRMED', platformConfirmedAt: null, orderReceivedAt: { gte: new Date(now - CONFIRM_WINDOW_MS) } },
    select: { id: true },
  });
  for (const o of unconfirmed) await pushPlatformStatus(o.id, 'confirm');

  const waiting = await prisma.externalOrder.findMany({
    where: { integrationId: { in: ids }, status: 'PENDING', orderReceivedAt: { lte: new Date(now - SECOND_ALERT_MS), gte: new Date(now - CONFIRM_WINDOW_MS) } },
    select: { id: true, restaurantId: true, externalOrderId: true, platformData: true },
  });
  for (const o of waiting) {
    await alertDeliveryProblem(o, {
      kind: 'ifood-waiting-2', severity: 'HIGH', title: 'Pedido do iFood esperando',
      message: `O pedido iFood #${displayOf(o)} espera o Aceitar: o iFood cancela em 8 minutos.`,
    });
  }
}

export async function pollIfoodOnce(): Promise<{ events: number; acked: number; failed: number }> {
  const linked = await linkedIntegrations();
  const byMerchant = new Map(linked.map((l) => [l.storeId, l]));
  const groups: Array<{ integration: Linked | null; members: Linked[] }> = [];
  if (ifoodMode() === 'centralized') {
    for (let i = 0; i < linked.length; i += MERCHANTS_PER_POLL) groups.push({ integration: null, members: linked.slice(i, i + MERCHANTS_PER_POLL) });
  } else {
    for (const l of linked) groups.push({ integration: l, members: [l] });
  }

  const result = { events: 0, acked: 0, failed: 0 };
  const polled: Linked[] = [];
  for (const g of groups) {
    let events: IfoodEventPayload[];
    try {
      events = await pollEvents(g.integration, g.members.map((m) => m.storeId));
    } catch (e: any) {
      await prisma.deliveryIntegration.updateMany({ where: { id: { in: g.members.map((m) => m.id) } }, data: { syncStatus: 'FAILED', syncError: String(e?.message ?? e).slice(0, 500) } });
      continue;
    }
    result.events += events.length;
    const done = new Set<string>();
    for (const ev of events) {
      if (!ev?.id || done.has(ev.id)) continue;
      const integration = byMerchant.get(ev.merchantId) ?? null;
      await prisma.ifoodEvent.createMany({
        data: [{ id: ev.id, integrationId: integration?.id ?? null, merchantId: String(ev.merchantId ?? ''), orderId: ev.orderId ?? null, code: String(ev.code ?? ''), fullCode: ev.fullCode ?? null, payload: ev as any }],
        skipDuplicates: true,
      });
      const row = await prisma.ifoodEvent.findUnique({ where: { id: ev.id }, select: { processedAt: true } });
      if (!row?.processedAt) {
        try {
          await processIfoodEvent(ev, integration);
          await prisma.ifoodEvent.update({ where: { id: ev.id }, data: { processedAt: new Date(), error: null } });
        } catch (e: any) {
          result.failed++;
          console.error(`[ifood] event ${ev.code} ${ev.id} failed:`, e?.message ?? e);
          await prisma.ifoodEvent.update({ where: { id: ev.id }, data: { error: String(e?.message ?? e).slice(0, 500) } }).catch(() => {});
          continue;
        }
      }
      done.add(ev.id);
    }
    if (done.size) {
      try {
        await ackEvents(g.integration, Array.from(done));
        result.acked += done.size;
      } catch (e: any) {
        console.error('[ifood] acknowledgment failed:', e?.message ?? e);
      }
    }
    await prisma.deliveryIntegration.updateMany({ where: { id: { in: g.members.map((m) => m.id) } }, data: { lastPolledAt: new Date(), syncStatus: 'SUCCESS', syncError: null } });
    polled.push(...g.members);
  }
  await afterPoll(polled);
  return result;
}
