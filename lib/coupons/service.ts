import { prisma } from '@/lib/prisma';
import { findCustomerByPhone } from '@/lib/cashback/service';
import { couponLabel, discountFor, normalizeCode, refusal, type CouponKind, type CouponRules } from './rules';

/**
 * Cupons no site de delivery (spec 2026-11-08 cupons §1, §3, §7): check a code for an order, and reserve one use in
 * a transaction (the total limit never overflows with two orders at once), released if the order is not created.
 */
type Check = { ok: true; couponId: string; code: string; discountCents: number; label: string } | { ok: false; error: string };

const toRules = (c: any): CouponRules => ({ ...c, kind: c.kind as CouponKind });

/** Has this phone already ordered on this restaurant's delivery site (not cancelled or refused)? */
async function customerOrdered(db: any, restaurantId: string, phoneDigits: string): Promise<boolean> {
  const customer = await findCustomerByPhone(db, restaurantId, phoneDigits);
  if (!customer) return false;
  const n = await db.externalOrder.count({
    where: { restaurantId, customerId: customer.id, integration: { platform: 'delivery_site' }, status: { notIn: ['CANCELLED', 'REJECTED'] } },
  });
  return n > 0;
}

async function evaluate(db: any, restaurantId: string, rawCode: unknown, phoneDigits: string, subtotalCents: number, deliveryFeeCents: number, now: Date): Promise<Check> {
  const code = normalizeCode(rawCode);
  if (!code) return { ok: false, error: 'Digite o código do cupom.' };
  const c = await db.coupon.findUnique({ where: { restaurantId_code: { restaurantId, code } } });
  if (!c) return { ok: false, error: 'Cupom não encontrado.' };
  const [usesByCustomer, ordered] = await Promise.all([
    phoneDigits ? db.couponRedemption.count({ where: { couponId: c.id, phoneDigits } }) : Promise.resolve(0),
    c.firstOrderOnly && phoneDigits ? customerOrdered(db, restaurantId, phoneDigits) : Promise.resolve(false),
  ]);
  if ((c.maxPerCustomer !== null || c.firstOrderOnly) && !phoneDigits) return { ok: false, error: 'Informe o seu celular para usar este cupom.' };
  const why = refusal(toRules(c), { subtotalCents, deliveryFeeCents, now, usesByCustomer, customerOrdered: ordered });
  if (why) return { ok: false, error: why };
  return { ok: true, couponId: c.id, code: c.code, discountCents: discountFor(toRules(c), subtotalCents, deliveryFeeCents), label: couponLabel(toRules(c)) };
}

/** The preview on the delivery site: nothing is written */
export const checkCoupon = (restaurantId: string, code: unknown, phoneDigits: string, subtotalCents: number, deliveryFeeCents: number, now = new Date()) =>
  evaluate(prisma, restaurantId, code, phoneDigits, subtotalCents, deliveryFeeCents, now);

/** One use reserved for an order being created; returns the redemption to attach (or release) */
export async function reserveCoupon(restaurantId: string, code: unknown, phoneDigits: string, subtotalCents: number, deliveryFeeCents: number, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const c = await tx.coupon.findUnique({ where: { restaurantId_code: { restaurantId, code: normalizeCode(code) } }, select: { id: true } });
    // Serialize the uses of this coupon: the limits are counted again under the lock
    if (c) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'coupon:' + c.id}))`;
    const check = await evaluate(tx, restaurantId, code, phoneDigits, subtotalCents, deliveryFeeCents, now);
    if (!check.ok) return check;
    await tx.coupon.update({ where: { id: check.couponId }, data: { usedCount: { increment: 1 } } });
    const r = await tx.couponRedemption.create({ data: { couponId: check.couponId, restaurantId, phoneDigits, discountCents: check.discountCents }, select: { id: true } });
    return { ...check, redemptionId: r.id };
  });
}

export const attachRedemption = (redemptionId: string, externalOrderId: string) =>
  prisma.couponRedemption.update({ where: { id: redemptionId }, data: { externalOrderId } });

/** The order was not created: the use goes back */
export async function releaseRedemption(redemptionId: string) {
  await prisma.$transaction(async (tx) => {
    const r = await tx.couponRedemption.findUnique({ where: { id: redemptionId }, select: { couponId: true } });
    if (!r) return;
    await tx.couponRedemption.delete({ where: { id: redemptionId } });
    await tx.coupon.update({ where: { id: r.couponId }, data: { usedCount: { decrement: 1 } } });
  });
}
