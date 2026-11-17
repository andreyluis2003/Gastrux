import type { Prisma, PrismaClient } from '@prisma/client';
import { CashRuleError } from '@/lib/caixa/rules';
import { normalizeDriverName } from '@/lib/caixa/driver-settlement';

/**
 * O que cada entregador ganhou (spec docs/superpowers/specs/2026-11-17-entregadores-taxa-fixa-design.md): every
 * delivery he took out and was not paid for yet, any payment method, plus one daily rate per work day not paid yet.
 * Values in cents, rates read from the registry at the time of the quote.
 */

type Db = PrismaClient | Prisma.TransactionClient;

const TZ = 'America/Sao_Paulo';
const DAY_TURNS_AT_HOURS = 5;
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** The driver's work day: the date in São Paulo of (d − 5 h), so the night past midnight is still the same day */
export function workDayOf(d: Date): string {
  return dayFormat.format(new Date(d.getTime() - DAY_TURNS_AT_HOURS * 3600_000));
}

export interface UnpaidDelivery { kind: 'order' | 'comanda'; id: string; label: string; workDay: string; deliveryFeeCents: number }
export interface DriverDeliveries { key: string; driverId: string | null; driverName: string | null; deliveries: UnpaidDelivery[] }

export interface PayQuote {
  deliveryCount: number;
  workDays: string[];
  dailyCount: number;
  dailyRateCents: number;
  perDeliveryCents: number;
  /** null = a typed name without a registration: no suggestion */
  suggestedCents: number | null;
  /** Sum of the delivery fees charged on these deliveries (the cashier's cap for a typed name) */
  feeCapCents: number;
  /** "2 diárias × R$ 40,00 + 14 entregas × R$ 8,00 = R$ 192,00"; empty for a typed name */
  text: string;
}

const cents = (reais: number) => Math.round(reais * 100);
// Plain space after "R$" (toLocaleString uses a non-breaking one)
export const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ');

/** Key of a driver: the registered driver's id, or 'name:' + the typed name */
export function parsePayKey(key: unknown): { driverId: string } | { driverName: string } {
  if (typeof key !== 'string' || !key) throw new CashRuleError('Escolha o entregador');
  if (key.startsWith('name:')) {
    const driverName = normalizeDriverName(key.slice(5));
    if (!driverName) throw new CashRuleError('Escolha o entregador');
    return { driverName };
  }
  return { driverId: key };
}

type Who = { driverId: string } | { driverName: string } | null;

/** Orders that went out ("Saiu para entrega" or delivered: dispatchedAt), with a driver, not cancelled, not paid to the driver yet */
function orderWhere(restaurantId: string, who: Who, ids?: string[]): Prisma.ExternalOrderWhereInput {
  const driver: Prisma.ExternalOrderWhereInput = !who
    ? { OR: [{ driverId: { not: null } }, { driverName: { not: null } }] }
    : 'driverId' in who ? { driverId: who.driverId } : { driverId: null, driverName: who.driverName };
  return {
    restaurantId,
    ...(ids ? { id: { in: ids } } : {}),
    driverPaymentId: null,
    status: { notIn: ['CANCELLED', 'REJECTED'] },
    // Only deliveries that went out with a dispatch time: orders from before this feature are not paid here
    dispatchedAt: { not: null },
    ...driver,
  };
}

/** WhatsApp delivery comandas that went out ("Saiu para entrega"), not cancelled, not paid to the driver yet */
function comandaWhere(restaurantId: string, who: Who, ids?: string[]): Prisma.OrderSessionWhereInput {
  const driver: Prisma.OrderSessionWhereInput = !who
    ? { OR: [{ driverId: { not: null } }, { driverName: { not: null } }] }
    : 'driverId' in who ? { driverId: who.driverId } : { driverId: null, driverName: who.driverName };
  return {
    restaurantId,
    ...(ids ? { id: { in: ids } } : {}),
    driverPaymentId: null,
    dispatchedAt: { not: null },
    status: { not: 'CANCELLED' },
    ...driver,
  };
}

const LIMIT = 2000;

async function loadDeliveries(db: Db, restaurantId: string, who: Who, ids?: { orders: string[]; comandas: string[] }) {
  const [orders, comandas] = await Promise.all([
    db.externalOrder.findMany({
      where: orderWhere(restaurantId, who, ids?.orders),
      select: { id: true, externalOrderId: true, customerName: true, driverId: true, driverName: true, dispatchedAt: true, deliveryFee: true },
      orderBy: { orderReceivedAt: 'asc' },
      take: LIMIT,
    }),
    db.orderSession.findMany({
      where: comandaWhere(restaurantId, who, ids?.comandas),
      select: { id: true, customerName: true, driverId: true, driverName: true, dispatchedAt: true },
      orderBy: { dispatchedAt: 'asc' },
      take: LIMIT,
    }),
  ]);
  const rows: Array<{ driverId: string | null; driverName: string | null; delivery: UnpaidDelivery }> = [
    ...orders.map((o) => ({
      driverId: o.driverId, driverName: o.driverName,
      delivery: { kind: 'order' as const, id: o.id, label: `Pedido ${o.externalOrderId} · ${o.customerName}`, workDay: workDayOf(o.dispatchedAt!), deliveryFeeCents: cents(o.deliveryFee) },
    })),
    // The WhatsApp robot charges no delivery fee: 0
    ...comandas.map((s) => ({
      driverId: s.driverId, driverName: s.driverName,
      delivery: { kind: 'comanda' as const, id: s.id, label: `Comanda WhatsApp${s.customerName ? ` · ${s.customerName}` : ''}`, workDay: workDayOf(s.dispatchedAt!), deliveryFeeCents: 0 },
    })),
  ];
  return rows;
}

function group(rows: Awaited<ReturnType<typeof loadDeliveries>>, names: Map<string, string>): DriverDeliveries[] {
  const out = new Map<string, DriverDeliveries>();
  for (const r of rows) {
    const key = r.driverId ?? `name:${r.driverName}`;
    let g = out.get(key);
    if (!g) {
      g = { key, driverId: r.driverId, driverName: (r.driverId && names.get(r.driverId)) || r.driverName, deliveries: [] };
      out.set(key, g);
    }
    g.deliveries.push(r.delivery);
  }
  for (const g of out.values()) g.deliveries.sort((a, b) => a.workDay.localeCompare(b.workDay));
  return [...out.values()].sort((a, b) => (a.driverName ?? '').localeCompare(b.driverName ?? '', 'pt-BR'));
}

/** Every driver with deliveries not paid yet: registered by id, typed names by name */
export async function unpaidDeliveries(db: Db, restaurantId: string): Promise<DriverDeliveries[]> {
  const rows = await loadDeliveries(db, restaurantId, null);
  const ids = [...new Set(rows.map((r) => r.driverId).filter((x): x is string => !!x))];
  const drivers = ids.length ? await db.driver.findMany({ where: { id: { in: ids }, restaurantId }, select: { id: true, name: true } }) : [];
  return group(rows, new Map(drivers.map((d) => [d.id, d.name])));
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The quote of a set of deliveries; for a registered driver, the rates and the days already paid */
export async function quoteFor(
  db: Db,
  driver: { id: string; dailyRateCents: number; perDeliveryCents: number } | null,
  deliveries: UnpaidDelivery[],
): Promise<PayQuote> {
  const deliveryCount = deliveries.length;
  const feeCapCents = deliveries.reduce((s, d) => s + d.deliveryFeeCents, 0);
  const days = [...new Set(deliveries.map((d) => d.workDay))].sort();
  if (!driver) {
    return { deliveryCount, workDays: [], dailyCount: 0, dailyRateCents: 0, perDeliveryCents: 0, suggestedCents: null, feeCapCents, text: '' };
  }
  const paid = days.length
    ? new Set((await db.driverPaidDay.findMany({ where: { driverId: driver.id, workDay: { in: days } }, select: { workDay: true } })).map((p) => p.workDay))
    : new Set<string>();
  const workDays = days.filter((d) => !paid.has(d));
  const dailyCount = workDays.length;
  const { dailyRateCents, perDeliveryCents } = driver;
  const suggestedCents = dailyRateCents * dailyCount + perDeliveryCents * deliveryCount;
  const parts: string[] = [];
  if (dailyCount > 0 && dailyRateCents > 0) parts.push(`${plural(dailyCount, 'diária', 'diárias')} × ${brl(dailyRateCents)}`);
  if (deliveryCount > 0 && perDeliveryCents > 0) parts.push(`${plural(deliveryCount, 'entrega', 'entregas')} × ${brl(perDeliveryCents)}`);
  const text = parts.length ? `${parts.join(' + ')} = ${brl(suggestedCents)}` : brl(suggestedCents);
  return { deliveryCount, workDays, dailyCount, dailyRateCents, perDeliveryCents, suggestedCents, feeCapCents, text };
}

/** The deliveries of one driver (by key); a registered driver of another restaurant is "not found" */
export async function deliveriesOf(db: Db, restaurantId: string, key: unknown, ids?: { orders: string[]; comandas: string[] }) {
  const who = parsePayKey(key);
  let driver: { id: string; name: string; dailyRateCents: number; perDeliveryCents: number } | null = null;
  if ('driverId' in who) {
    driver = await db.driver.findFirst({ where: { id: who.driverId, restaurantId }, select: { id: true, name: true, dailyRateCents: true, perDeliveryCents: true } });
    if (!driver) throw new CashRuleError('Entregador não encontrado', 404);
  }
  const rows = await loadDeliveries(db, restaurantId, who, ids);
  return { driver, driverName: driver?.name ?? ('driverName' in who ? who.driverName : null), deliveries: rows.map((r) => r.delivery) };
}

export async function payQuote(db: Db, restaurantId: string, key: string): Promise<PayQuote> {
  const { driver, deliveries } = await deliveriesOf(db, restaurantId, key);
  return quoteFor(db, driver, deliveries);
}

/** The GET list: every driver with deliveries to pay, and the quote */
export async function payList(db: Db, restaurantId: string) {
  const groups = await unpaidDeliveries(db, restaurantId);
  const ids = groups.map((g) => g.driverId).filter((x): x is string => !!x);
  const drivers = new Map(
    (ids.length ? await db.driver.findMany({ where: { id: { in: ids }, restaurantId }, select: { id: true, dailyRateCents: true, perDeliveryCents: true } }) : []).map((d) => [d.id, d]),
  );
  return Promise.all(groups.map(async (g) => ({
    key: g.key, driverId: g.driverId, driverName: g.driverName, deliveries: g.deliveries,
    quote: await quoteFor(db, g.driverId ? drivers.get(g.driverId) ?? null : null, g.deliveries),
  })));
}
