import type { CashMethod, DeliveryPaymentMethod, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { recordAudit, type RestaurantMember } from '@/lib/auth/restaurant-role';
import { CashRuleError, parseCountedCents } from './rules';
import { isManager } from './roles';

/**
 * Acerto com o entregador (spec docs/superpowers/specs/2026-10-26-acerto-entregador-design.md): the money of the
 * delivery orders paid at the door comes to an open shift. Receipts have no comanda (orderSessionId null), so they
 * count in the drawer's expected amounts but never again in the sales: the order is already the revenue.
 */

export const DOOR_METHODS: DeliveryPaymentMethod[] = ['CASH', 'CREDIT_ON_DELIVERY', 'DEBIT_ON_DELIVERY', 'VOUCHER_ON_DELIVERY'];
const DRAWER_METHOD: Record<string, CashMethod> = { CASH: 'CASH', CREDIT_ON_DELIVERY: 'CREDIT', DEBIT_ON_DELIVERY: 'DEBIT', VOUCHER_ON_DELIVERY: 'OTHER' };

/** Paid at the door, out for delivery or delivered, not settled yet */
const pendingWhere = (restaurantId: string): Prisma.ExternalOrderWhereInput => ({
  restaurantId,
  paidOnline: false,
  paymentMethod: { in: DOOR_METHODS },
  status: { in: ['PICKED_UP', 'DELIVERED'] },
  settlementId: null,
});

const cents = (reais: number) => Math.round(reais * 100);

export function normalizeDriverName(value: unknown): string | null {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 60) : '';
  return name || null;
}

export interface DriverGroup {
  driverName: string | null;
  orders: Array<{ id: string; number: string; customerName: string; paymentMethod: string; status: string; totalCents: number; deliveryFeeCents: number }>;
  cashCents: number;
  creditCents: number;
  debitCents: number;
  otherCents: number;
  deliveryFeeCents: number;
}

function totals(orders: Array<{ paymentMethod: string | null; totalAmount: number; deliveryFee: number }>) {
  const out = { cashCents: 0, creditCents: 0, debitCents: 0, otherCents: 0, deliveryFeeCents: 0 };
  for (const o of orders) {
    const c = cents(o.totalAmount);
    const m = DRAWER_METHOD[o.paymentMethod ?? ''];
    if (m === 'CASH') out.cashCents += c;
    else if (m === 'CREDIT') out.creditCents += c;
    else if (m === 'DEBIT') out.debitCents += c;
    else out.otherCents += c;
    out.deliveryFeeCents += cents(o.deliveryFee);
  }
  return out;
}

/** What each driver has to bring back, plus the names used before (suggestions for "Saiu para entrega") */
export async function pendingByDriver(restaurantId: string): Promise<{ drivers: DriverGroup[]; driverNames: string[] }> {
  const [orders, names] = await Promise.all([
    prisma.externalOrder.findMany({
      where: pendingWhere(restaurantId),
      select: { id: true, externalOrderId: true, customerName: true, paymentMethod: true, status: true, totalAmount: true, deliveryFee: true, driverName: true, orderReceivedAt: true },
      orderBy: { orderReceivedAt: 'asc' },
      take: 500,
    }),
    prisma.externalOrder.findMany({
      where: { restaurantId, driverName: { not: null }, orderReceivedAt: { gte: new Date(Date.now() - 60 * 86400_000) } },
      select: { driverName: true },
      distinct: ['driverName'],
      take: 50,
    }),
  ]);
  const groups = new Map<string | null, typeof orders>();
  for (const o of orders) groups.set(o.driverName, [...(groups.get(o.driverName) ?? []), o]);
  const drivers = [...groups.entries()]
    .map(([driverName, list]) => ({
      driverName,
      orders: list.map((o) => ({
        id: o.id, number: o.externalOrderId, customerName: o.customerName, paymentMethod: o.paymentMethod as string, status: o.status,
        totalCents: cents(o.totalAmount), deliveryFeeCents: cents(o.deliveryFee),
      })),
      ...totals(list),
    }))
    // Named drivers by name, "Sem nome" last
    .sort((a, b) => (a.driverName === null ? 1 : b.driverName === null ? -1 : a.driverName.localeCompare(b.driverName, 'pt-BR')));
  const driverNames = names.map((n) => n.driverName!).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return { drivers, driverNames };
}

export interface SettleInput {
  driverName?: unknown;
  orderIds?: unknown;
  receivedCash?: unknown;
  driverPay?: unknown;
  reason?: unknown;
}

export async function settleDriver(member: RestaurantMember, sessionId: string, input: SettleInput) {
  const ids = Array.isArray(input.orderIds) ? [...new Set(input.orderIds.filter((x): x is string => typeof x === 'string'))] : [];
  if (!ids.length || ids.length > 200) throw new CashRuleError('Escolha os pedidos do acerto');
  const receivedCashCents = parseCountedCents(input.receivedCash, 'Dinheiro recebido');
  const driverPayCents = input.driverPay === undefined || input.driverPay === null || input.driverPay === '' ? 0 : parseCountedCents(input.driverPay, 'Pagamento do entregador');
  const reason = typeof input.reason === 'string' && input.reason.trim() ? input.reason.trim().slice(0, 200) : null;
  const driverName = normalizeDriverName(input.driverName);
  const label = driverName ?? 'entregador sem nome';

  const session = await prisma.cashSession.findFirst({ where: { id: String(sessionId ?? ''), restaurantId: member.restaurantId }, select: { id: true } });
  if (!session) throw new CashRuleError('Caixa não encontrado', 404);

  const result = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ status: string }>>`SELECT "status"::text AS "status" FROM "cash_sessions" WHERE "id" = ${session.id} FOR UPDATE`;
    if (rows[0]?.status !== 'OPEN') throw new CashRuleError('Este caixa já foi fechado', 409);
    // Locks the orders: two settlements at once of the same order, the second finds it settled
    await tx.$queryRaw`SELECT "id" FROM "external_orders" WHERE "id" = ANY(${ids}) FOR UPDATE`;
    const orders = await tx.externalOrder.findMany({ where: { id: { in: ids }, ...pendingWhere(member.restaurantId) }, select: { id: true, paymentMethod: true, totalAmount: true, deliveryFee: true } });
    if (orders.length !== ids.length) throw new CashRuleError('Algum pedido já foi acertado ou não é pago na entrega. Atualize a tela.', 409);

    const t = totals(orders);
    const differenceCents = receivedCashCents - t.cashCents;
    if (differenceCents !== 0 && (reason?.length ?? 0) < 3) throw new CashRuleError('O dinheiro não bate com os pedidos: informe o motivo da diferença');
    if (driverPayCents > t.deliveryFeeCents && !isManager(member.role)) {
      throw new CashRuleError('Pagar ao entregador mais que as taxas de entrega exige um gerente', 403);
    }

    const settlement = await tx.deliverySettlement.create({
      data: {
        restaurantId: member.restaurantId, cashSessionId: session.id, driverName, orderCount: orders.length,
        expectedCashCents: t.cashCents, receivedCashCents, creditCents: t.creditCents, debitCents: t.debitCents, otherCents: t.otherCents,
        driverPayCents, reason, createdById: member.userId,
      },
    });
    const base = { restaurantId: member.restaurantId, cashSessionId: session.id, createdById: member.userId, deliverySettlementId: settlement.id };
    const desc = `Acerto de ${label} (${orders.length} ${orders.length === 1 ? 'pedido' : 'pedidos'})`;
    const lines: Prisma.CashSessionEntryCreateManyInput[] = [];
    for (const [method, amount] of [['CASH', t.cashCents], ['CREDIT', t.creditCents], ['DEBIT', t.debitCents], ['OTHER', t.otherCents]] as const) {
      if (amount > 0) lines.push({ ...base, type: 'RECEIPT', method, amountCents: amount, description: desc });
    }
    if (differenceCents !== 0) {
      lines.push({ ...base, type: 'ADJUSTMENT', method: 'CASH', amountCents: Math.abs(differenceCents), direction: differenceCents < 0 ? 'OUT' : 'IN', description: `Diferença no acerto de ${label}: ${reason}` });
    }
    if (driverPayCents > 0) {
      lines.push({ ...base, type: 'EXPENSE', method: 'CASH', amountCents: driverPayCents, category: 'entregador', description: `Pagamento de ${label}` });
    }
    await tx.cashSessionEntry.createMany({ data: lines });
    await tx.externalOrder.updateMany({ where: { id: { in: ids } }, data: { settlementId: settlement.id } });
    return { settlement, differenceCents, totals: t };
  });
  await recordAudit(member, {
    action: 'CREATE', entityType: 'DeliverySettlement', entityId: result.settlement.id,
    changes: { driverName, orders: ids.length, expectedCashCents: result.totals.cashCents, receivedCashCents, driverPayCents, differenceCents: result.differenceCents },
  });
  return { settlement: result.settlement, differenceCents: result.differenceCents };
}
