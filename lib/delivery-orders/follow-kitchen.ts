import { prisma } from '@/lib/prisma';
import { canMoveExternalOrderStatus } from '@/lib/delivery-integration/external-order-status';
import { notifyOrderStatus } from './callback';
import { pushPlatformStatus, type PlatformChange } from './platform-sync';

/** What the kitchen tells the platform (iFood): the cancellation goes through Pedidos de delivery, with a reason */
const TO_PLATFORM: Record<string, PlatformChange> = { PREPARING: 'preparing', READY: 'ready', COMPLETED: 'dispatch' };

const FROM_KITCHEN: Record<string, 'PREPARING' | 'READY' | 'DELIVERED' | 'CANCELLED'> = {
  PREPARING: 'PREPARING', READY: 'READY', COMPLETED: 'DELIVERED', CANCELLED: 'CANCELLED',
};

/**
 * The order of the pipeline follows its kitchen order (final review 2026-10-24: it stayed "Confirmado", so every site
 * order sat among the active ones in Pedidos de delivery). Only forward; then the sender hears the new status.
 */
export async function followKitchen(externalOrderId: string, kitchenStatus: string, opts: { fromPlatform?: boolean } = {}): Promise<void> {
  try {
    const target = FROM_KITCHEN[kitchenStatus];
    const ext = await prisma.externalOrder.findUnique({ where: { id: externalOrderId }, select: { status: true } });
    if (target && ext && canMoveExternalOrderStatus(ext.status, target)) {
      const moved = await prisma.externalOrder.updateMany({ where: { id: externalOrderId, status: ext.status }, data: { status: target } });
      if (moved.count && !opts.fromPlatform && TO_PLATFORM[kitchenStatus]) await pushPlatformStatus(externalOrderId, TO_PLATFORM[kitchenStatus]);
      if (moved.count) {
        await prisma.deliveryLog.create({
          data: { externalOrderId, eventType: 'STATUS_CHANGED', previousStatus: ext.status, newStatus: target, message: 'Status da cozinha', eventTimestamp: new Date() },
        }).catch(() => {});
      }
    }
  } catch (e) {
    console.error('[delivery-orders] follow kitchen failed:', e);
  }
  void notifyOrderStatus(externalOrderId);
}
