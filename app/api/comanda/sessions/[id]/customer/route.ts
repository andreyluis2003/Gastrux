import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { CASHIER_PLUS } from '@/lib/caixa/roles';
import { CashRuleError } from '@/lib/caixa/rules';
import { lockComanda } from '@/lib/comanda/add-item';
import { loadBill } from '@/lib/comanda/bill-service';
import { normalizePhone } from '@/lib/cashback/rules';
import { removeUse, upsertCustomerByPhone } from '@/lib/cashback/service';

export const dynamic = 'force-dynamic';

const fail = (e: unknown) => {
  if (e instanceof CashRuleError) return NextResponse.json({ error: e.message, ...(e.code ? { code: e.code } : {}) }, { status: e.status });
  throw e;
};

async function openBill(tx: any, restaurantId: string, sessionId: string) {
  await lockComanda(tx, sessionId);
  const s = await tx.orderSession.findFirst({ where: { id: sessionId, restaurantId }, select: { id: true, status: true, customerId: true } });
  if (!s) throw new CashRuleError('Comanda não encontrada', 404);
  if (s.status === 'CLOSED' || s.status === 'CANCELLED') throw new CashRuleError('A conta já foi fechada', 422, 'ALREADY_CLOSED');
  return s;
}

/**
 * PUT { phone, name? } - the customer of this bill, by phone (spec 2026-10-23 §7.1); a new phone needs the
 * name. Changing the customer removes the cashback the bill was using. DELETE - no customer.
 */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(CASHIER_PLUS, 'Identificar o cliente exige o caixa');
  if (!auth.ok) return auth.response;
  const { restaurantId } = auth.member;
  const body = await req.json().catch(() => ({}));
  const phone = normalizePhone(body?.phone);
  if (!phone) return NextResponse.json({ error: 'Celular inválido: use DDD e número' }, { status: 400 });
  try {
    await prisma.$transaction(async (tx) => {
      const s = await openBill(tx, restaurantId, params.id);
      const customer = await upsertCustomerByPhone(tx, restaurantId, phone, body?.name);
      if (s.customerId && s.customerId !== customer.id) await removeUse(tx, restaurantId, params.id);
      await tx.orderSession.update({ where: { id: params.id }, data: { customerId: customer.id } });
    });
    return NextResponse.json(await loadBill(prisma, restaurantId, params.id));
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(CASHIER_PLUS, 'Identificar o cliente exige o caixa');
  if (!auth.ok) return auth.response;
  const { restaurantId } = auth.member;
  try {
    await prisma.$transaction(async (tx) => {
      await openBill(tx, restaurantId, params.id);
      await removeUse(tx, restaurantId, params.id);
      await tx.orderSession.update({ where: { id: params.id }, data: { customerId: null } });
    });
    return NextResponse.json(await loadBill(prisma, restaurantId, params.id));
  } catch (e) {
    return fail(e);
  }
}
