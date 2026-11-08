import { prisma } from '@/lib/prisma';
import { recordAudit, type RestaurantMember } from '@/lib/auth/restaurant-role';

/**
 * Loja aberta / fechada (spec 2026-11-07 quadro-de-pedidos §A). Closed: no new orders from customers outside the
 * restaurant (delivery site, WhatsApp, order API, iFood). The dining room (Vender, table QR) is not affected.
 */
export const CLOSED_MESSAGE = 'A loja está fechada agora e não está recebendo pedidos.';

export async function isStoreClosed(restaurantId: string): Promise<boolean> {
  const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { ordersClosedAt: true } });
  return !!r?.ordersClosedAt;
}

export async function storeState(restaurantId: string) {
  const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { ordersClosedAt: true } });
  return { closed: !!r?.ordersClosedAt, closedAt: r?.ordersClosedAt ?? null };
}

/**
 * Closing pauses a connected, active iFood store and remembers it; opening resumes iFood only when the close paused
 * it (an iFood paused by hand stays paused).
 */
export async function setStoreClosed(member: RestaurantMember, closed: boolean) {
  const rid = member.restaurantId;
  const result = await prisma.$transaction(async (tx) => {
    const r = await tx.restaurant.findUnique({ where: { id: rid }, select: { ordersClosedAt: true, ordersClosedPausedIfood: true } });
    if (!r) return null;
    if (!!r.ordersClosedAt === closed) return { closed, ifood: null as null | 'paused' | 'resumed' };
    const ifood = await tx.deliveryIntegration.findUnique({
      where: { restaurantId_platform: { restaurantId: rid, platform: 'ifood' } },
      select: { id: true, storeId: true, isActive: true },
    });
    let ifoodChange: null | 'paused' | 'resumed' = null;
    let pausedIfood = false;
    if (closed && ifood?.storeId && ifood.isActive) {
      await tx.deliveryIntegration.update({ where: { id: ifood.id }, data: { isActive: false } });
      ifoodChange = 'paused';
      pausedIfood = true;
    }
    if (!closed && r.ordersClosedPausedIfood && ifood?.storeId && !ifood.isActive) {
      await tx.deliveryIntegration.update({ where: { id: ifood.id }, data: { isActive: true } });
      ifoodChange = 'resumed';
    }
    await tx.restaurant.update({ where: { id: rid }, data: { ordersClosedAt: closed ? new Date() : null, ordersClosedPausedIfood: pausedIfood } });
    return { closed, ifood: ifoodChange };
  });
  if (result) await recordAudit(member, { action: 'UPDATE', entityType: 'Restaurant', entityId: rid, changes: { loja: closed ? 'fechada' : 'aberta', ifood: result.ifood } });
  return result;
}
