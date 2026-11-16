import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { CASHIER_PLUS } from '@/lib/caixa/roles';
import { CashRuleError } from '@/lib/caixa/rules';
import { lockComanda } from '@/lib/comanda/add-item';
import { closeIfCovered, emitClosedBill, loadBill } from '@/lib/comanda/bill-service';
import { onBillClosed } from '@/lib/cashback/bill';
import { normalizePhone } from '@/lib/cashback/rules';
import { takeCouponTry } from '@/lib/coupons/attempts';
import { PHONE_NEEDED } from '@/lib/coupons/service';
import { applyCouponToSession, removeSessionCoupon } from '@/lib/coupons/session';

export const dynamic = 'force-dynamic';

const DENIED = 'Usar cupom exige o caixa';

const fail = (e: unknown) => {
  if (e instanceof CashRuleError) return NextResponse.json({ error: e.message, ...(e.code ? { code: e.code } : {}) }, { status: e.status });
  throw e;
};

/**
 * Cupom na Conta (spec 2026-11-16 cupom-whatsapp-balcao, parte 1a). POST { code } - applies a coupon to this bill,
 * reserving its use under the comanda and coupon locks; the phone is the customer identified on the bill. DELETE -
 * takes it off and gives the use back. Both answer with the Bill.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(CASHIER_PLUS, DENIED);
  if (!auth.ok) return auth.response;
  const { restaurantId, userId } = auth.member;
  // The team shares one address in the room: the tries count per logged user (and per restaurant)
  if (!takeCouponTry('user:' + userId, restaurantId)) {
    return NextResponse.json({ error: 'Muitas tentativas. Tente em um minuto.' }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  try {
    const result = await prisma.$transaction(async (tx) => {
      await lockComanda(tx, params.id);
      const s = await tx.orderSession.findFirst({ where: { id: params.id, restaurantId }, select: { customer: { select: { phone: true } } } });
      const phoneDigits = normalizePhone(s?.customer?.phone) ?? '';
      const r = await applyCouponToSession(tx, { restaurantId, sessionId: params.id, code: String(body?.code ?? ''), phoneDigits });
      // Only an existing, live coupon gets here (unknown and paused ones answer INVALID first)
      if (!r.ok && r.error === PHONE_NEEDED && !phoneDigits) return { ...r, error: 'Identifique o cliente pelo celular antes' };
      if (!r.ok) return r;
      // The total went down: what was already paid may now go over it (rolled back) or cover it (the bill closes)
      const bill = (await loadBill(tx, restaurantId, params.id))!;
      if (bill.paidCents > bill.totalCents) {
        throw new CashRuleError('O cupom passa do que falta pagar: estorne um pagamento antes', 409, 'OVERPAID');
      }
      const closed = await closeIfCovered(tx, restaurantId, params.id, bill);
      if (closed) await onBillClosed(tx, restaurantId, params.id);
      return { ok: true as const, closed: !!closed, customerName: bill.customerName };
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    if (result.closed) await emitClosedBill(auth.member, params.id, null, result.customerName);
    return NextResponse.json(await loadBill(prisma, restaurantId, params.id));
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(CASHIER_PLUS, DENIED);
  if (!auth.ok) return auth.response;
  const { restaurantId } = auth.member;
  try {
    await prisma.$transaction(async (tx) => {
      await lockComanda(tx, params.id);
      const s = await tx.orderSession.findFirst({ where: { id: params.id, restaurantId }, select: { status: true } });
      if (!s) throw new CashRuleError('Conta não encontrada.', 404);
      // A closed bill keeps its coupon (reopen it first); a cancelled one already gave the use back
      if (s.status === 'CLOSED' || s.status === 'CANCELLED') throw new CashRuleError('Esta conta já foi fechada.', 422, 'ALREADY_CLOSED');
      await removeSessionCoupon(tx, restaurantId, params.id);
    });
    return NextResponse.json(await loadBill(prisma, restaurantId, params.id));
  } catch (e) {
    return fail(e);
  }
}
