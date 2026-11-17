import { Prisma, type CashMethod, type DeliveryPaymentMethod } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { recordAudit, type RestaurantMember } from '@/lib/auth/restaurant-role';
import { lockComanda } from '@/lib/comanda/add-item';
import { deliveriesOf, payList, quoteFor, type PayQuote } from '@/lib/delivery/driver-pay';
import { CashRuleError, parseAmountCents, parseCountedCents } from './rules';
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
export async function pendingByDriver(restaurantId: string): Promise<{ drivers: DriverGroup[]; driverNames: string[]; pay: Awaited<ReturnType<typeof payList>> }> {
  const [orders, names, pay] = await Promise.all([
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
    // What each driver earned (spec 2026-11-17 entregadores): every delivery, any payment method
    payList(prisma, restaurantId),
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
  return { drivers, driverNames, pay };
}

export interface SettleInput {
  driverName?: unknown;
  orderIds?: unknown;
  receivedCash?: unknown;
  /** Legacy (before 2026-11-17): pay a typed-name driver at the money settlement, up to the delivery fees */
  driverPay?: unknown;
  reason?: unknown;
  /** Pay the driver what he earned (spec 2026-11-17 entregadores): key = driverId or 'name:' + typed name */
  pay?: unknown;
}

/** P2002 on driver_paid_days (driverId, workDay): meta.target is the index name or its columns */
function isPaidDayClash(e: Prisma.PrismaClientKnownRequestError): boolean {
  const target = e.meta?.target;
  const text = Array.isArray(target) ? target.join(',') : String(target ?? '');
  return text.includes('driver_paid_days') || (text.includes('driverId') && text.includes('workDay'));
}

const ALREADY_PAID ='Este entregador já foi pago agora. Atualize a tela.';
const OVER_FEES = 'Pagar ao entregador mais que as taxas de entrega exige um gerente';
const OVER_QUOTE = 'Pagar ao entregador mais que o calculado exige um gerente';

/**
 * The acerto: with orderIds, brings the door money of those orders to this open shift (rule of 2026-10-26, unchanged);
 * with pay, pays the driver what he earned (daily rates + deliveries, any payment method) as a cash Despesa of this
 * shift, which may leave the expected cash negative. Both in one transaction.
 * Lock order (as the comanda bill and "Saiu para entrega"): comandas by id -> cash session -> external orders by id.
 */
export async function settleDriver(member: RestaurantMember, sessionId: string, input: SettleInput) {
  const ids = Array.isArray(input.orderIds) ? [...new Set(input.orderIds.filter((x): x is string => typeof x === 'string'))] : [];
  if (ids.length > 200) throw new CashRuleError('Escolha os pedidos do acerto');
  const payIn = input.pay && typeof input.pay === 'object' ? (input.pay as { key?: unknown; amount?: unknown }) : null;
  if (!ids.length && !payIn) throw new CashRuleError('Escolha os pedidos do acerto');

  const settling = ids.length > 0;
  const receivedCashCents = settling ? parseCountedCents(input.receivedCash, 'Dinheiro recebido') : 0;
  const legacyPayCents = !settling || input.driverPay === undefined || input.driverPay === null || input.driverPay === ''
    ? 0 : parseCountedCents(input.driverPay, 'Pagamento do entregador');
  if (legacyPayCents > 0 && payIn) throw new CashRuleError('Informe o pagamento do entregador uma vez só');
  const payAmountCents = payIn ? parseAmountCents(payIn.amount, 'Pagamento do entregador') : 0;
  const reason = typeof input.reason === 'string' && input.reason.trim() ? input.reason.trim().slice(0, 200) : null;
  const driverName = normalizeDriverName(input.driverName);
  const label = driverName ?? 'entregador sem nome';

  const session = await prisma.cashSession.findFirst({ where: { id: String(sessionId ?? ''), restaurantId: member.restaurantId }, select: { id: true } });
  if (!session) throw new CashRuleError('Caixa não encontrado', 404);
  const { restaurantId } = member;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // The driver's deliveries before the locks; recomputed after them (a swap or a payment meanwhile drops out).
      // Comanda locks come BEFORE the shift lock: paying a comanda's bill takes the comanda lock, then the shift
      // (FOR SHARE); the opposite order here would deadlock with it.
      const candidates = payIn ? (await deliveriesOf(tx, restaurantId, payIn.key)).deliveries : [];
      const payComandaIds = candidates.filter((d) => d.kind === 'comanda').map((d) => d.id).sort();
      const payOrderIds = candidates.filter((d) => d.kind === 'order').map((d) => d.id);
      for (const id of payComandaIds) await lockComanda(tx, id);

      const rows = await tx.$queryRaw<Array<{ status: string }>>`SELECT "status"::text AS "status" FROM "cash_sessions" WHERE "id" = ${session.id} FOR UPDATE`;
      if (rows[0]?.status !== 'OPEN') throw new CashRuleError('Este caixa já foi fechado', 409);

      const lockIds = [...new Set([...ids, ...payOrderIds])].sort();
      // Locks the orders: two settlements at once of the same order, the second finds it settled (or paid)
      if (lockIds.length) await tx.$queryRaw`SELECT "id" FROM "external_orders" WHERE "id" = ANY(${lockIds}) ORDER BY "id" FOR UPDATE`;
      if (payComandaIds.length) await tx.$queryRaw`SELECT "id" FROM "order_sessions" WHERE "id" = ANY(${payComandaIds}) ORDER BY "id" FOR UPDATE`;

      const lines: Prisma.CashSessionEntryCreateManyInput[] = [];
      let settlement: { id: string } | null = null;
      let differenceCents = 0;
      let t: ReturnType<typeof totals> | null = null;
      if (settling) {
        const orders = await tx.externalOrder.findMany({
          where: { id: { in: ids }, ...pendingWhere(restaurantId) },
          select: { id: true, paymentMethod: true, totalAmount: true, deliveryFee: true, driverId: true, driverPaymentId: true },
        });
        if (orders.length !== ids.length) throw new CashRuleError('Algum pedido já foi acertado ou não é pago na entrega. Atualize a tela.', 409);
        t = totals(orders);
        differenceCents = receivedCashCents - t.cashCents;
        if (differenceCents !== 0 && (reason?.length ?? 0) < 3) throw new CashRuleError('O dinheiro não bate com os pedidos: informe o motivo da diferença');
        if (legacyPayCents > 0) {
          if (orders.some((o) => o.driverId)) throw new CashRuleError('Entregador cadastrado: pague pela conta de diárias e entregas');
          if (legacyPayCents > t.deliveryFeeCents && !isManager(member.role)) throw new CashRuleError(OVER_FEES, 403);
        }
        settlement = await tx.deliverySettlement.create({
          data: {
            restaurantId, cashSessionId: session.id, driverName, orderCount: orders.length,
            expectedCashCents: t.cashCents, receivedCashCents, creditCents: t.creditCents, debitCents: t.debitCents, otherCents: t.otherCents,
            driverPayCents: legacyPayCents, reason, createdById: member.userId,
          },
        });
        const base = { restaurantId, cashSessionId: session.id, createdById: member.userId, deliverySettlementId: settlement.id };
        const desc = `Acerto de ${label} (${orders.length} ${orders.length === 1 ? 'pedido' : 'pedidos'})`;
        for (const [method, amount] of [['CASH', t.cashCents], ['CREDIT', t.creditCents], ['DEBIT', t.debitCents], ['OTHER', t.otherCents]] as const) {
          if (amount > 0) lines.push({ ...base, type: 'RECEIPT', method, amountCents: amount, description: desc });
        }
        if (differenceCents !== 0) {
          lines.push({ ...base, type: 'ADJUSTMENT', method: 'CASH', amountCents: Math.abs(differenceCents), direction: differenceCents < 0 ? 'OUT' : 'IN', description: `Diferença no acerto de ${label}: ${reason}` });
        }
        await tx.externalOrder.updateMany({ where: { id: { in: ids } }, data: { settlementId: settlement.id } });
        if (legacyPayCents > 0) {
          // The old driverPay becomes a payment of the typed name, covering the orders of this settlement
          const unpaid = orders.filter((o) => !o.driverPaymentId);
          const legacy = await tx.driverPayment.create({
            data: {
              restaurantId, driverId: null, driverName, cashSessionId: session.id, deliverySettlementId: settlement.id,
              deliveryCount: unpaid.length, paidCents: legacyPayCents, createdById: member.userId,
            },
          });
          if (unpaid.length) {
            await tx.externalOrder.updateMany({ where: { id: { in: unpaid.map((o) => o.id) }, driverPaymentId: null }, data: { driverPaymentId: legacy.id } });
          }
          lines.push({ ...base, type: 'EXPENSE', method: 'CASH', amountCents: legacyPayCents, category: 'entregador', description: `Pagamento de ${label}` });
        }
      }

      let payment: { id: string; paidCents: number; quote: PayQuote; driverName: string | null } | null = null;
      if (payIn) {
        const fresh = await deliveriesOf(tx, restaurantId, payIn.key, { orders: payOrderIds, comandas: payComandaIds });
        if (!fresh.deliveries.length) throw new CashRuleError(ALREADY_PAID, 409);
        const quote = await quoteFor(tx, fresh.driver, fresh.deliveries);
        const cap = quote.suggestedCents ?? quote.feeCapCents;
        if (payAmountCents > cap && !isManager(member.role)) throw new CashRuleError(quote.suggestedCents === null ? OVER_FEES : OVER_QUOTE, 403);
        const created = await tx.driverPayment.create({
          data: {
            restaurantId, driverId: fresh.driver?.id ?? null, driverName: fresh.driverName, cashSessionId: session.id,
            deliverySettlementId: settlement?.id ?? null, deliveryCount: quote.deliveryCount, dailyCount: quote.dailyCount,
            dailyRateCents: quote.dailyRateCents, perDeliveryCents: quote.perDeliveryCents, suggestedCents: quote.suggestedCents ?? 0,
            paidCents: payAmountCents, createdById: member.userId,
          },
        });
        // One daily per driver and work day: a second payment of the same day breaks the unique index (P2002 -> 409)
        const driver = fresh.driver;
        if (driver && quote.workDays.length) {
          await tx.driverPaidDay.createMany({ data: quote.workDays.map((workDay) => ({ driverId: driver.id, workDay, driverPaymentId: created.id })) });
        }
        const orderIds = fresh.deliveries.filter((d) => d.kind === 'order').map((d) => d.id);
        const comandaIds = fresh.deliveries.filter((d) => d.kind === 'comanda').map((d) => d.id);
        const o = orderIds.length
          ? await tx.externalOrder.updateMany({ where: { id: { in: orderIds }, restaurantId, driverPaymentId: null }, data: { driverPaymentId: created.id } })
          : { count: 0 };
        const c = comandaIds.length
          ? await tx.orderSession.updateMany({ where: { id: { in: comandaIds }, restaurantId, driverPaymentId: null }, data: { driverPaymentId: created.id } })
          : { count: 0 };
        if (o.count !== orderIds.length || c.count !== comandaIds.length) throw new CashRuleError(ALREADY_PAID, 409);
        const who = fresh.driverName ?? 'entregador';
        const detail = quote.text ? `: ${quote.text}` : ` (${quote.deliveryCount} ${quote.deliveryCount === 1 ? 'entrega' : 'entregas'})`;
        lines.push({
          restaurantId, cashSessionId: session.id, createdById: member.userId, deliverySettlementId: settlement?.id ?? null,
          type: 'EXPENSE', method: 'CASH', amountCents: payAmountCents, category: 'entregador',
          description: `Pagamento de ${who}${detail}`.slice(0, 200),
        });
        payment = { id: created.id, paidCents: payAmountCents, quote, driverName: fresh.driverName };
      }
      if (lines.length) await tx.cashSessionEntry.createMany({ data: lines });
      return { settlement, differenceCents, totals: t, payment };
    });
    if (result.settlement) {
      await recordAudit(member, {
        action: 'CREATE', entityType: 'DeliverySettlement', entityId: result.settlement.id,
        changes: { driverName, orders: ids.length, expectedCashCents: result.totals?.cashCents ?? 0, receivedCashCents, driverPayCents: legacyPayCents, differenceCents: result.differenceCents },
      });
    }
    if (result.payment) {
      const q = result.payment.quote;
      await recordAudit(member, {
        action: 'CREATE', entityType: 'DriverPayment', entityId: result.payment.id,
        changes: { driverName: result.payment.driverName, deliveryCount: q.deliveryCount, dailyCount: q.dailyCount, workDays: q.workDays, suggestedCents: q.suggestedCents, paidCents: result.payment.paidCents },
      });
    }
    return {
      settlement: result.settlement,
      differenceCents: result.differenceCents,
      payment: result.payment ? { id: result.payment.id, paidCents: result.payment.paidCents, quote: result.payment.quote } : null,
    };
  } catch (e) {
    // Only the one-daily-per-day index means "paid meanwhile"; any other unique violation is a real error
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && isPaidDayClash(e)) throw new CashRuleError(ALREADY_PAID, 409);
    throw e;
  }
}
