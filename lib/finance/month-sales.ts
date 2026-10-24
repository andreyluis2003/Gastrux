import { prisma } from '@/lib/prisma';
import { salesSummary } from '@/lib/caixa/rules';
import { CASH_METHODS } from '@/lib/caixa/payment-methods';
import { splitTableOnline, TABLE_ONLINE_SELECT, TABLE_ONLINE_WHERE } from '@/lib/caixa/table-online';
import { brtDayStart } from '@/lib/staff/commission-rules';
import { addMonths } from '@/lib/utility-bills/rules';

export interface PeriodSales {
  totalCents: number;
  /** Comandas (tables, counter, QR, WhatsApp): drawer sales + online table payments */
  salaoCents: number;
  /** Kitchen orders without a comanda: site delivery and delivery integrations */
  deliveryCents: number;
  /** Delivery by origin (plan 2026-10-23 api-de-pedidos): the Gastrux order API, and the rest (site, older orders) */
  deliveryByOrigin: { site: number; gastrux_api: number };
  /** Service charge of the bills closed in the period (already inside salaoCents) */
  serviceCents: number;
  deliveryDiscountCents: number;
  deliveryTaxesCents: number;
  /** Per method, in cents: drawer methods, PIX_ONLINE / CARD_ONLINE (pay at the table), DELIVERY */
  byMethod: Record<string, number>;
  salesCount: number;
}

const cents = (v: unknown) => Math.round(Number(v ?? 0) * 100);

/**
 * Sales in [from, to), the Caixa criterion (spec 2026-10-16 contas de consumo, 4.5; DRE revenue fix of
 * the same day): cash sale entries of comandas, online table payments applied to bills (after refunds),
 * and kitchen orders without a comanda (site delivery, integrations) not cancelled.
 */
export async function salesInRange(restaurantId: string, from: Date, to: Date): Promise<PeriodSales> {
  const kitchenDelivery = { restaurantId, orderSessionId: null, status: { not: 'CANCELLED' as const }, createdAt: { gte: from, lt: to } };
  const [entries, online, orders, service, apiOrders] = await Promise.all([
    prisma.cashSessionEntry.findMany({
      where: { restaurantId, orderSessionId: { not: null }, createdAt: { gte: from, lt: to } },
      select: { type: true, method: true, amountCents: true, direction: true, orderSessionId: true },
    }),
    prisma.payment.findMany({
      where: { restaurantId, ...TABLE_ONLINE_WHERE, appliedToBillAt: { gte: from, lt: to } },
      select: TABLE_ONLINE_SELECT,
    }),
    prisma.order.aggregate({
      where: { restaurantId, orderSessionId: null, status: { not: 'CANCELLED' }, createdAt: { gte: from, lt: to } },
      _sum: { total: true, discount: true, taxes: true },
      _count: true,
    }),
    prisma.orderSession.aggregate({
      where: { restaurantId, status: 'CLOSED', closedAt: { gte: from, lt: to } },
      _sum: { serviceChargeCents: true },
    }),
    prisma.order.aggregate({
      where: { ...kitchenDelivery, externalOrder: { integration: { platform: 'gastrux_api' } } },
      _sum: { total: true },
    }),
  ]);
  const split = splitTableOnline(online as any);
  const summary = salesSummary(entries as any, split.perBill);
  const deliveryCents = cents(orders._sum.total);
  const byMethod: Record<string, number> = {};
  for (const m of CASH_METHODS) if (summary.byMethod[m]) byMethod[m] = summary.byMethod[m];
  if (split.totals.pixCents) byMethod.PIX_ONLINE = split.totals.pixCents;
  if (split.totals.cardCents) byMethod.CARD_ONLINE = split.totals.cardCents;
  if (deliveryCents) byMethod.DELIVERY = deliveryCents;
  return {
    totalCents: summary.totalCents + deliveryCents,
    salaoCents: summary.totalCents,
    deliveryCents,
    deliveryByOrigin: { site: deliveryCents - cents(apiOrders._sum.total), gastrux_api: cents(apiOrders._sum.total) },
    serviceCents: service._sum.serviceChargeCents ?? 0,
    deliveryDiscountCents: cents(orders._sum.discount),
    deliveryTaxesCents: cents(orders._sum.taxes),
    byMethod,
    salesCount: summary.salesCount + (orders._count ?? 0),
  };
}

/** Sales of a Brasília month (the % of revenue of the utility bills) */
export async function monthSalesCents(restaurantId: string, ym: string): Promise<number> {
  return (await salesInRange(restaurantId, brtDayStart(`${ym}-01`), brtDayStart(`${addMonths(ym, 1)}-01`))).totalCents;
}
