import { prisma } from '@/lib/prisma';
import { recordAudit, type RestaurantMember } from '@/lib/auth/restaurant-role';
import { confirmOrder, dispatchOrder, readyToPickup, requestCancellation, startPreparation } from '@/lib/ifood/client';
import { DeliveryOrderError } from './ingest';

/**
 * What Gastrux does to an order goes back to its platform (plan 2026-10-24 ifood, Task 4): one place, so the Open
 * Delivery platforms of part 2 plug in here later. Only iFood today; any other platform is a no-op.
 */
export type PlatformChange = 'confirm' | 'preparing' | 'ready' | 'dispatch' | { cancel: { code: string; reason: string } };

async function platformOrder(externalOrderId: string) {
  return prisma.externalOrder.findUnique({
    where: { id: externalOrderId },
    select: { id: true, externalOrderId: true, status: true, platformData: true, integration: { select: { id: true, platform: true } } },
  });
}

async function call(ext: NonNullable<Awaited<ReturnType<typeof platformOrder>>>, change: PlatformChange): Promise<boolean> {
  const integration = { id: ext.integration.id };
  const data = (ext.platformData ?? {}) as { deliveredBy?: string | null; orderType?: string };
  if (change === 'confirm') await confirmOrder(integration, ext.externalOrderId);
  else if (change === 'preparing') await startPreparation(integration, ext.externalOrderId);
  else if (change === 'ready') await readyToPickup(integration, ext.externalOrderId);
  else if (change === 'dispatch') {
    // Only the store's own delivery is dispatched by the store; iFood's couriers and takeouts are not
    if (data.orderType !== 'DELIVERY' || data.deliveredBy !== 'MERCHANT') return false;
    await dispatchOrder(integration, ext.externalOrderId);
  } else await requestCancellation(integration, ext.externalOrderId, { reason: change.cancel.reason, cancellationCode: change.cancel.code });
  return true;
}

const changeName = (c: PlatformChange) => (typeof c === 'string' ? c : 'cancel');

/** Never throws: a failure is logged on the order (the poll retries a missing confirm) */
export async function pushPlatformStatus(externalOrderId: string, change: PlatformChange): Promise<boolean> {
  const ext = await platformOrder(externalOrderId).catch(() => null);
  if (!ext || ext.integration.platform !== 'ifood') return true;
  try {
    const sent = await call(ext, change);
    if (sent && change === 'confirm') await prisma.externalOrder.update({ where: { id: ext.id }, data: { platformConfirmedAt: new Date() } });
    return true;
  } catch (e: any) {
    console.error(`[platform-sync] iFood ${changeName(change)} failed:`, e?.message ?? e);
    await prisma.deliveryLog.create({
      data: {
        externalOrderId: ext.id, eventType: 'STATUS_CHANGED', previousStatus: ext.status, newStatus: ext.status, eventTimestamp: new Date(),
        message: `iFood não recebeu "${changeName(change)}": ${String(e?.message ?? e).slice(0, 300)}`,
      },
    }).catch(() => {});
    return false;
  }
}

export async function isPlatformOrder(externalOrderId: string): Promise<boolean> {
  return (await platformOrder(externalOrderId))?.integration.platform === 'ifood';
}

/**
 * The restaurant cancels an accepted iFood order (Pedidos de delivery, with a reason from iFood's list). The kitchen
 * order is cancelled when iFood's CAN event arrives (lib/ifood/events.ts).
 */
export async function cancelPlatformOrder(member: RestaurantMember, externalOrderId: string, why: { code: unknown; reason: unknown }): Promise<void> {
  const code = typeof why.code === 'string' ? why.code.trim() : '';
  const reason = typeof why.reason === 'string' ? why.reason.trim().slice(0, 200) : '';
  if (!code) throw new DeliveryOrderError('Escolha o motivo do iFood');
  const ext = await prisma.externalOrder.findFirst({ where: { id: externalOrderId, restaurantId: member.restaurantId }, select: { id: true, status: true } });
  if (!ext) throw new DeliveryOrderError('Pedido não encontrado', 404);
  if (ext.status === 'CANCELLED' || ext.status === 'REJECTED' || ext.status === 'DELIVERED') throw new DeliveryOrderError('Este pedido já foi concluído ou cancelado', 409);
  const ok = await pushPlatformStatus(ext.id, { cancel: { code, reason: reason || 'Cancelado pelo restaurante' } });
  if (!ok) throw new DeliveryOrderError('O iFood não recebeu o cancelamento: tente de novo', 502);
  await recordAudit(member, { action: 'UPDATE', entityType: 'ExternalOrder', entityId: ext.id, changes: { cancelRequested: code, reason } });
}
