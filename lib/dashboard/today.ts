import { prisma } from '@/lib/prisma';
import { salesInRange } from '@/lib/finance/month-sales';
import { brtDay, brtDayStart } from '@/lib/staff/commission-rules';
import { lowStockCount } from './stats';
import type { TodayData } from './today-tiles';

/**
 * The numbers of the "Painel do dia" (2026-10-18 UX research, proposal 1), for today in Brasília. Same rules as the
 * screens the tiles open: sales as in Caixa, open comandas as in Vender, delivery as the Vender badge.
 */
const OPEN_COMANDA = ['OPEN', 'SENT_TO_KITCHEN', 'READY'] as const;
const DAY_MS = 86_400_000;

export async function todayData(restaurantId: string, now = new Date()): Promise<TodayData> {
  const day = brtDay(now);
  const from = brtDayStart(day);
  const to = new Date(from.getTime() + DAY_MS);
  const dayDate = new Date(`${day}T00:00:00.000Z`);
  const [sales, shifts, comandas, deliveryPending, kitchenQueue, bills, lowStock] = await Promise.all([
    salesInRange(restaurantId, from, to),
    prisma.cashSession.findMany({
      where: { restaurantId, status: 'OPEN' },
      select: { cashRegister: { select: { name: true } } },
      orderBy: { openedAt: 'asc' },
    }),
    prisma.orderSession.findMany({ where: { restaurantId, status: { in: [...OPEN_COMANDA] } }, select: { tableNumber: true, tableId: true } }),
    prisma.externalOrder.count({ where: { restaurantId, status: 'PENDING' } }),
    prisma.order.count({ where: { restaurantId, status: { in: ['PENDING', 'PREPARING'] } } }),
    prisma.payable.findMany({ where: { restaurantId, status: 'OPEN', dueDate: { lte: dayDate } }, select: { dueDate: true, amountCents: true } }),
    lowStockCount(restaurantId),
  ]);
  const sum = (sel: typeof bills) => ({ count: sel.length, cents: sel.reduce((s, b) => s + b.amountCents, 0) });
  return {
    salesCents: sales.totalCents,
    salesCount: sales.salesCount,
    openShifts: shifts.map((s) => ({ registerName: s.cashRegister?.name ?? 'Caixa' })),
    openTables: comandas.filter((c) => c.tableId || c.tableNumber != null).length,
    openComandas: comandas.length,
    deliveryPending,
    kitchenQueue,
    payables: {
      overdue: sum(bills.filter((b) => b.dueDate.getTime() < dayDate.getTime())),
      today: sum(bills.filter((b) => b.dueDate.getTime() === dayDate.getTime())),
    },
    lowStock,
  };
}
