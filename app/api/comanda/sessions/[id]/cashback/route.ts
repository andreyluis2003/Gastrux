import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { CASHIER_PLUS } from '@/lib/caixa/roles';
import { CashRuleError } from '@/lib/caixa/rules';
import { lockComanda } from '@/lib/comanda/add-item';
import { loadBill } from '@/lib/comanda/bill-service';
import { balanceCents, getCashbackSettings, removeUse, useOnSession } from '@/lib/cashback/service';

export const dynamic = 'force-dynamic';

const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fail = (e: unknown) => {
  if (e instanceof CashRuleError) return NextResponse.json({ error: e.message, ...(e.code ? { code: e.code } : {}) }, { status: e.status });
  throw e;
};

/**
 * POST { cents? } - use the customer's cashback as a discount on this bill (spec 2026-10-23 §7.1): up to the
 * balance and to what is left to pay (cents left out = the most it can). DELETE - stop using it.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(CASHIER_PLUS, 'Usar cashback exige o caixa');
  if (!auth.ok) return auth.response;
  const { restaurantId } = auth.member;
  const settings = await getCashbackSettings(restaurantId);
  if (!settings.available) return NextResponse.json({ error: 'O cashback é do plano Business', code: 'PLAN_REQUIRED' }, { status: 403 });
  if (!settings.enabled) return NextResponse.json({ error: 'O cashback está desligado em Clientes e marketing > Cashback' }, { status: 422 });
  const body = await req.json().catch(() => ({}));
  const asked = Number.isInteger(body?.cents) && body.cents > 0 ? (body.cents as number) : null;
  try {
    await prisma.$transaction(async (tx) => {
      await lockComanda(tx, params.id);
      const bill = await loadBill(tx, restaurantId, params.id);
      if (!bill) throw new CashRuleError('Comanda não encontrada', 404);
      if (bill.status === 'CLOSED' || bill.status === 'CANCELLED') throw new CashRuleError('A conta já foi fechada', 422, 'ALREADY_CLOSED');
      if (!bill.customer) throw new CashRuleError('Identifique o cliente pelo celular antes', 422);
      if (bill.cashbackUsedCents > 0) throw new CashRuleError('Esta conta já usa cashback', 409);
      const balance = await balanceCents(tx, restaurantId, bill.customer.id);
      if (balance < Math.max(1, settings.minUseCents)) {
        throw new CashRuleError(`O cashback pode ser usado a partir de ${brl(settings.minUseCents)}. Saldo: ${brl(balance)}`, 422);
      }
      const cents = Math.min(asked ?? balance, balance, bill.remainingCents);
      if (cents <= 0) throw new CashRuleError('A conta já está paga', 422);
      await useOnSession(tx, { restaurantId, customerId: bill.customer.id, orderSessionId: params.id, cents });
    });
    return NextResponse.json(await loadBill(prisma, restaurantId, params.id));
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(CASHIER_PLUS, 'Usar cashback exige o caixa');
  if (!auth.ok) return auth.response;
  const { restaurantId } = auth.member;
  try {
    await prisma.$transaction(async (tx) => {
      await lockComanda(tx, params.id);
      const s = await tx.orderSession.findFirst({ where: { id: params.id, restaurantId }, select: { status: true } });
      if (!s) throw new CashRuleError('Comanda não encontrada', 404);
      if (s.status === 'CLOSED' || s.status === 'CANCELLED') throw new CashRuleError('A conta já foi fechada', 422, 'ALREADY_CLOSED');
      await removeUse(tx, restaurantId, params.id);
    });
    return NextResponse.json(await loadBill(prisma, restaurantId, params.id));
  } catch (e) {
    return fail(e);
  }
}
