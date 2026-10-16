import { prisma } from '@/lib/prisma';
import { salesSummary } from '@/lib/caixa/rules';
import { splitTableOnline, TABLE_ONLINE_SELECT, TABLE_ONLINE_WHERE } from '@/lib/caixa/table-online';
import { brtDayStart } from '@/lib/staff/commission-rules';
import { addMonths } from '@/lib/utility-bills/rules';

/**
 * Sales of a Brasília month, the Caixa criterion (spec 2026-10-16 contas de consumo, 4.5): cash sale
 * entries of comandas, online table payments applied to bills (after refunds), and kitchen orders
 * without a comanda (site delivery, integrations) not cancelled. Also meant for the DRE revenue fix.
 */
export async function monthSalesCents(restaurantId: string, ym: string): Promise<number> {
  const from = brtDayStart(`${ym}-01`);
  const to = brtDayStart(`${addMonths(ym, 1)}-01`);
  const [entries, online, orders] = await Promise.all([
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
      _sum: { total: true },
    }),
  ]);
  const cashAndOnline = salesSummary(entries as any, splitTableOnline(online as any).perBill).totalCents;
  return cashAndOnline + Math.round(Number(orders._sum.total ?? 0) * 100);
}
