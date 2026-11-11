// Releases the pre-orders on the service day (spec 2026-11-10 cardapio-da-semana): at 00:00 in the restaurant's
// timezone each PLACED pre-order becomes the site order (ExternalOrder + kitchen Order), exactly once.
import { prisma } from '@/lib/prisma';
import { writeSiteOrder } from '@/lib/delivery-site/write-order';
import { attachRedemption } from '@/lib/coupons/service';
import { dayLabel, isDue, todayIn } from './rules';

const round2 = (v: number) => Math.round(v * 100) / 100;

// The furthest-ahead timezone (UTC+14): no restaurant's "today" is later than this, so it bounds the query
const LATEST_TZ = 'Pacific/Kiritimati';
/** A claim older than this is stale (crashed run); a failed attempt waits this long before the retry */
export const RETRY_MS = 5 * 60_000;
const BATCH = 200;

const logError = (msg: string, e: any) => console.error(`[weekly-menu] ${msg}:`, e?.message ?? e);

async function linkCoupon(p: { id: string; couponRedemptionId: string | null }, externalOrderId: string) {
  if (!p.couponRedemptionId) return;
  await attachRedemption(p.couponRedemptionId, externalOrderId).catch((e) => logError(`coupon link of pre-order ${p.id} failed`, e));
}

/** RELEASING rows whose claim is stale: finish them when the Order exists, else hand them back to PLACED. */
async function recoverStale(restaurantId: string | undefined, now: Date) {
  const stale = await prisma.weeklyMenuOrder.findMany({
    where: { status: 'RELEASING', releasingAt: { lt: new Date(now.getTime() - RETRY_MS) }, ...(restaurantId ? { restaurantId } : {}) },
    select: { id: true, restaurantId: true, orderNumber: true, couponRedemptionId: true },
    take: BATCH,
  });
  for (const p of stale) {
    try {
      const order = await prisma.order.findFirst({
        where: { restaurantId: p.restaurantId, orderNumber: p.orderNumber },
        select: { id: true, externalOrderId: true },
      });
      if (order) {
        const done = await prisma.weeklyMenuOrder.updateMany({ where: { id: p.id, status: 'RELEASING' }, data: { status: 'RELEASED', orderId: order.id } });
        if (done.count && order.externalOrderId) await linkCoupon(p, order.externalOrderId);
      } else {
        // releasingAt stays old, so the due pass below may retry it right away
        await prisma.weeklyMenuOrder.updateMany({ where: { id: p.id, status: 'RELEASING' }, data: { status: 'PLACED' } });
      }
    } catch (e) {
      logError(`recovery of pre-order ${p.id} failed`, e);
    }
  }
}

/** Releases the due pre-orders (one restaurant, or all); returns how many became orders. */
export async function releaseDue(restaurantId?: string, now: Date = new Date()): Promise<number> {
  await recoverStale(restaurantId, now);

  const candidates = await prisma.weeklyMenuOrder.findMany({
    where: {
      status: 'PLACED',
      ...(restaurantId ? { restaurantId } : {}),
      weeklyMenu: { serviceDate: { lte: todayIn(LATEST_TZ, now) } },
      // Backoff: a failed attempt is retried only after RETRY_MS, so failing rows never crowd out the rest
      OR: [{ releasingAt: null }, { releasingAt: { lt: new Date(now.getTime() - RETRY_MS) } }],
    },
    include: {
      items: true,
      weeklyMenu: { select: { serviceDate: true } },
      restaurant: { select: { timezone: true } },
    },
    // Earliest service day first, so tomorrow's pre-orders never crowd out today's
    orderBy: [{ weeklyMenu: { serviceDate: 'asc' } }, { createdAt: 'asc' }],
    take: BATCH,
  });

  let released = 0;
  for (const p of candidates) {
    try {
      const serviceDate = p.weeklyMenu.serviceDate;
      if (!isDue(serviceDate, todayIn(p.restaurant.timezone, now))) continue;

      // Claim: only one caller (loop, board load, other process) moves PLACED -> RELEASING
      const claim = await prisma.weeklyMenuOrder.updateMany({
        where: { id: p.id, status: 'PLACED' },
        data: { status: 'RELEASING', releasingAt: now },
      });
      if (claim.count === 0) continue;

      let written: { orderId: string; externalOrderId: string };
      try {
        written = await writeSiteOrder({
          restaurantId: p.restaurantId,
          orderNumber: p.orderNumber,
          customerId: p.customerId,
          customerName: p.customerName,
          customerPhone: p.customerPhone,
          customerEmail: p.customerEmail,
          isPickup: p.isPickup,
          deliveryAddress: p.deliveryAddress,
          deliveryCity: p.deliveryCity,
          deliveryZipCode: p.deliveryZipCode,
          kitchenNote: `ENCOMENDA do cardápio de ${dayLabel(serviceDate)}\n${p.kitchenNote}`,
          items: p.items.map((i) => ({
            recipeId: i.recipeId, name: i.name, quantity: i.quantity,
            ...(i.specialInstructions ? { specialInstructions: i.specialInstructions } : {}),
          })),
          subtotal: round2(p.subtotal),
          deliveryFee: round2(p.deliveryFee),
          discount: round2(p.discount),
          total: round2(p.total),
          paymentMethod: p.paymentMethod,
          cashChangeFor: p.cashChangeFor === null ? null : round2(p.cashChangeFor),
          voucherBrand: p.voucherBrand,
        });
      } catch (e) {
        logError(`release of pre-order ${p.id} (${p.orderNumber}) failed`, e);
        // Back to PLACED keeping releasingAt as the last attempt: retried after RETRY_MS. If this fails too,
        // the stale-claim recovery hands it back later.
        await prisma.weeklyMenuOrder
          .updateMany({ where: { id: p.id, status: 'RELEASING' }, data: { status: 'PLACED' } })
          .catch((e2) => logError(`revert of pre-order ${p.id} failed`, e2));
        continue;
      }

      // The order exists now: mark it first, so a later failure can never write it twice (a failed mark is finished
      // by the stale-claim recovery, which finds the Order by its number)
      await prisma.weeklyMenuOrder.updateMany({ where: { id: p.id, status: 'RELEASING' }, data: { status: 'RELEASED', orderId: written.orderId } });
      await linkCoupon(p, written.externalOrderId);
      released++;
    } catch (e) {
      logError(`release of pre-order ${p.id} failed`, e);
    }
  }
  return released;
}
