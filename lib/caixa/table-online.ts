import { prisma } from '@/lib/prisma';
import { onlinePaidCents } from '@/lib/comanda/bill';

/** Pay at the table (spec 2026-10-10 §5.2): the online payments of a shift are those applied to its bills */
export const TABLE_ONLINE_WHERE = { appliedToBillAt: { not: null } } as const;
export const TABLE_ONLINE_SELECT = { method: true, amount: true, amountRefunded: true, status: true, orderSessionId: true } as const;

type TableOnlineRow = { method: string; amount: unknown; amountRefunded: unknown; status: string; orderSessionId: string | null };

/** What is left of each payment after refunds: totals per method (never in the drawer) and per bill (for the sales count) */
export function splitTableOnline(rows: TableOnlineRow[]) {
  let pixCents = 0;
  let cardCents = 0;
  const perBill: Array<{ orderSessionId: string; cents: number }> = [];
  for (const p of rows) {
    const cents = onlinePaidCents(p);
    if (p.method === 'PIX') pixCents += cents; else cardCents += cents;
    if (p.orderSessionId) perBill.push({ orderSessionId: p.orderSessionId, cents });
  }
  return { totals: { pixCents, cardCents }, perBill };
}

export async function tableOnlineOf(restaurantId: string, cashSessionId: string) {
  const rows = await prisma.payment.findMany({ where: { restaurantId, cashSessionId, ...TABLE_ONLINE_WHERE }, select: TABLE_ONLINE_SELECT });
  return splitTableOnline(rows);
}
