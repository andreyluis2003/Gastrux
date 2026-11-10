import { prisma } from '@/lib/prisma';
import { recordAudit, type RestaurantMember } from '@/lib/auth/restaurant-role';
import { hoursState } from '@/lib/orders/hours';
import { followStoreToggle } from '@/lib/ninetynine/connect';

/**
 * Loja aberta / fechada (spec 2026-11-07 quadro-de-pedidos §A). Closed: no new orders from customers outside the
 * restaurant (delivery site, WhatsApp, order API, iFood). The dining room (Vender, table QR) is not affected.
 */
export const CLOSED_MESSAGE = 'A loja está fechada agora e não está recebendo pedidos.';

export interface StoreState {
  closed: boolean;
  /** 'manual' (closed by the button), 'horario' (automatic mode, outside the business hours) or null when open */
  reason: 'manual' | 'horario' | null;
  closedAt: Date | null;
  /** "hoje às 18:00" when closed by the hours */
  opens: string | null;
  /** The automatic mode is on (spec 2026-11-08 loja-pelo-horario) */
  auto: boolean;
}

/** Open or closed now: closed by hand always wins; with the automatic mode on, outside the hours is closed too */
export function stateOf(r: { ordersClosedAt: Date | null; businessHours: unknown; timezone: string } | null, now = new Date()): StoreState {
  if (!r) return { closed: false, reason: null, closedAt: null, opens: null, auto: false };
  const hours = hoursState(r.businessHours, r.timezone, now);
  const auto = !!(r.businessHours && typeof r.businessHours === 'object' && (r.businessHours as any).auto === true);
  if (r.ordersClosedAt) return { closed: true, reason: 'manual', closedAt: r.ordersClosedAt, opens: null, auto };
  if (hours.closedByHours) return { closed: true, reason: 'horario', closedAt: null, opens: hours.opens, auto };
  return { closed: false, reason: null, closedAt: null, opens: null, auto };
}

const STATE_SELECT = { ordersClosedAt: true, businessHours: true, timezone: true } as const;

export async function storeState(restaurantId: string, now = new Date()): Promise<StoreState> {
  const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: STATE_SELECT });
  return stateOf(r, now);
}

export async function isStoreClosed(restaurantId: string, now = new Date()): Promise<boolean> {
  return (await storeState(restaurantId, now)).closed;
}

/**
 * Closing pauses a connected, active iFood store and remembers it; opening resumes iFood only when the close paused
 * it (an iFood paused by hand stays paused). A linked, active 99Food store is paused / put back online on the 99Food
 * too, after the change is saved and in the background: the toggle never waits for the 99Food (`ninetynine: 'pending'`)
 * and a failure goes to the sino (plan 2026-11-09 99food, Task 6).
 */
export async function setStoreClosed(member: RestaurantMember, closed: boolean) {
  const rid = member.restaurantId;
  let changed = false;
  const result = await prisma.$transaction(async (tx) => {
    const r = await tx.restaurant.findUnique({ where: { id: rid }, select: { ordersClosedAt: true, ordersClosedPausedIfood: true } });
    if (!r) return null;
    if (!!r.ordersClosedAt === closed) return { closed, ifood: null as null | 'paused' | 'resumed' };
    changed = true;
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
  if (!result) return result;
  const ninetynine = changed ? await followStoreToggle(rid, closed) : null;
  await recordAudit(member, { action: 'UPDATE', entityType: 'Restaurant', entityId: rid, changes: { loja: closed ? 'fechada' : 'aberta', ifood: result.ifood, ninetynine } });
  return { ...result, ninetynine };
}
