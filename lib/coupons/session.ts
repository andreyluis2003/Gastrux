import type { Prisma } from '@prisma/client';
import { comandaTotalCents } from '@/lib/caixa/sale';
import { lockComanda } from '@/lib/comanda/add-item';
import { discountFor, normalizeCode, type CouponKind, type CouponRules } from './rules';
import { evaluateCoupon, INVALID, type Check } from './service';

/**
 * Cupom na comanda (spec 2026-11-16 cupom-whatsapp-balcao): one coupon per comanda, on the comanda items (no service
 * charge, no delivery fee). The discount is fixed when applied. Every write runs under the comanda lock and the coupon
 * lock, so the total limit never overflows with two cashiers at once.
 */

export type ApplyResult =
  | { ok: true; code: string; discountCents: number; outOfRule: boolean; /** The rule the forced use broke */ warning?: string }
  | { ok: false; error: string; status: number };

/** Serialize the uses of one coupon (the same key as reserveCoupon on the delivery site) */
export const lockCoupon = (tx: Prisma.TransactionClient, couponId: string) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'coupon:' + couponId}))`;

/**
 * Applies a coupon to an open comanda, inside the caller's transaction. With force (the cashier insists) any refusal
 * but "this code does not exist" becomes a use out of rule, with the normal discount.
 */
export async function applyCouponToSession(
  tx: Prisma.TransactionClient,
  input: { restaurantId: string; sessionId: string; code: string; phoneDigits: string; force?: boolean },
): Promise<ApplyResult> {
  const { restaurantId, sessionId, phoneDigits } = input;
  await lockComanda(tx, sessionId);
  const session = await tx.orderSession.findFirst({ where: { id: sessionId, restaurantId }, select: { status: true, couponCode: true } });
  if (!session) return { ok: false, error: 'Conta não encontrada.', status: 404 };
  if (session.status === 'CLOSED' || session.status === 'CANCELLED') return { ok: false, error: 'Esta conta já foi fechada.', status: 422 };
  if (session.couponCode) return { ok: false, error: 'Esta conta já tem cupom.', status: 409 };

  const code = normalizeCode(input.code);
  if (!code) return { ok: false, error: 'Digite o código do cupom.', status: 422 };
  const coupon = await tx.coupon.findUnique({ where: { restaurantId_code: { restaurantId, code } } });
  // force never applies a code that does not exist; the answer does not tell it apart from a paused one
  if (!coupon) return { ok: false, error: INVALID, status: 422 };
  await lockCoupon(tx, coupon.id);

  const subtotalCents = await comandaTotalCents(tx, sessionId);
  // Evaluated under the lock: usedCount is read again after the other cashier committed
  const check = await evaluateCoupon(tx, restaurantId, code, phoneDigits, subtotalCents, 0, new Date(), { channel: 'comanda' });
  let discountCents: number;
  let outOfRule = false;
  let warning: string | undefined;
  if (check.ok) {
    discountCents = check.discountCents;
  } else {
    // Free delivery has nothing to discount on a comanda: forcing it would spend a use for R$ 0
    // (paused or not; check.error is already INVALID for a paused one, so its kind is not revealed)
    if (!input.force || coupon.kind === 'FREE_DELIVERY') return { ok: false, error: check.error, status: 422 };
    const rules = { ...coupon, kind: coupon.kind as CouponKind } as CouponRules;
    discountCents = discountFor(rules, subtotalCents, 0);
    outOfRule = true;
    warning = check.error;
  }

  await tx.coupon.update({ where: { id: coupon.id }, data: { usedCount: { increment: 1 } } });
  await tx.couponRedemption.create({ data: { couponId: coupon.id, restaurantId, phoneDigits, discountCents, orderSessionId: sessionId, outOfRule } });
  await tx.orderSession.update({ where: { id: sessionId }, data: { couponDiscountCents: discountCents, couponCode: coupon.code } });
  return { ok: true, code: coupon.code, discountCents, outOfRule, ...(warning ? { warning } : {}) };
}

/** Takes the coupon off the comanda and gives the use back; a comanda without a coupon is left as it is */
export async function removeSessionCoupon(tx: Prisma.TransactionClient, restaurantId: string, sessionId: string): Promise<void> {
  await lockComanda(tx, sessionId);
  const session = await tx.orderSession.findFirst({ where: { id: sessionId, restaurantId }, select: { couponCode: true } });
  if (!session?.couponCode) return;
  const redemption = await tx.couponRedemption.findFirst({ where: { orderSessionId: sessionId, restaurantId }, select: { id: true, couponId: true } });
  if (redemption) {
    await lockCoupon(tx, redemption.couponId);
    await tx.couponRedemption.delete({ where: { id: redemption.id } });
    await tx.coupon.update({ where: { id: redemption.couponId }, data: { usedCount: { decrement: 1 } } });
  }
  await tx.orderSession.update({ where: { id: sessionId }, data: { couponDiscountCents: 0, couponCode: null } });
}

/** What the coupon would give on these items; nothing is written */
export const previewSessionCoupon = (
  db: any,
  input: { restaurantId: string; code: unknown; phoneDigits: string; subtotalCents: number },
): Promise<Check> =>
  evaluateCoupon(db, input.restaurantId, input.code, input.phoneDigits, input.subtotalCents, 0, new Date(), { channel: 'comanda' });

/** Everything the customer does not pay on this bill: the coupon and the cashback used */
export const sessionDiscountCents = (s: { couponDiscountCents: number; cashbackUsedCents: number }): number =>
  s.couponDiscountCents + s.cashbackUsedCents;
