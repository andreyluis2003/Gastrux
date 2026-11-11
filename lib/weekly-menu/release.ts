// Releases the pre-orders on the service day (spec 2026-11-10 cardapio-da-semana): at 00:00 in the restaurant's
// timezone each PLACED pre-order becomes the site order (ExternalOrder + kitchen Order), exactly once.
import { prisma } from '@/lib/prisma';
import { writeSiteOrder } from '@/lib/delivery-site/write-order';
import { attachRedemption } from '@/lib/coupons/service';
import { dayLabel, isDue, todayIn } from './rules';

const round2 = (v: number) => Math.round(v * 100) / 100;

// The furthest-ahead timezone (UTC+14): no restaurant's "today" is later than this, so it bounds the query
const LATEST_TZ = 'Pacific/Kiritimati';

/** Releases the due pre-orders (one restaurant, or all); returns how many became orders. */
export async function releaseDue(restaurantId?: string, now: Date = new Date()): Promise<number> {
  const candidates = await prisma.weeklyMenuOrder.findMany({
    where: {
      status: 'PLACED',
      ...(restaurantId ? { restaurantId } : {}),
      weeklyMenu: { serviceDate: { lte: todayIn(LATEST_TZ, now) } },
    },
    include: {
      items: true,
      weeklyMenu: { select: { serviceDate: true } },
      restaurant: { select: { timezone: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });

  let released = 0;
  for (const p of candidates) {
    const serviceDate = p.weeklyMenu.serviceDate;
    if (!isDue(serviceDate, todayIn(p.restaurant.timezone, now))) continue;

    // Claim: only one caller (loop, board load, other process) moves PLACED -> RELEASING
    const claim = await prisma.weeklyMenuOrder.updateMany({ where: { id: p.id, status: 'PLACED' }, data: { status: 'RELEASING' } });
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
    } catch (e: any) {
      // Back to PLACED: the next cycle tries again
      await prisma.weeklyMenuOrder.update({ where: { id: p.id }, data: { status: 'PLACED' } }).catch(() => {});
      console.error(`[weekly-menu] release of ${p.orderNumber} failed:`, e?.message ?? e);
      continue;
    }

    // The order exists now: mark it first, so a later failure can never write it twice
    await prisma.weeklyMenuOrder.update({ where: { id: p.id }, data: { status: 'RELEASED', orderId: written.orderId } });
    if (p.couponRedemptionId) {
      await attachRedemption(p.couponRedemptionId, written.externalOrderId).catch((e: any) =>
        console.error(`[weekly-menu] coupon link of ${p.orderNumber} failed:`, e?.message ?? e),
      );
    }
    released++;
  }
  return released;
}
