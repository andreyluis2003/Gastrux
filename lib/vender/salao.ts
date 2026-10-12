import { prisma } from '@/lib/prisma';
import { lineTotalCents } from '@/lib/comanda/line-total';
import { sessionLabel } from './rules';
import { loadBill } from '@/lib/comanda/bill-service';

/**
 * Everything the Vender map shows, in one round trip (spec 2026-10-07, 4.1): tables with their open
 * comanda, the open comandas without a table (by name, counter), and how many delivery orders are new.
 */

export interface SalaoSession {
  id: string;
  label: string;
  tableId: string | null;
  customerName: string | null;
  openedAt: string;
  openedBy: string | null;
  totalCents: number;
  itemCount: number;
  newCount: number;
  status: string;
  /** Pre-bill printed: the table asked for the bill (yellow on the map) */
  billRequested: boolean;
  /** When the table tapped "Pagar com o garçom" (pay at the table); cleared by a payment or when the bill closes */
  waiterCalledAt: string | null;
  /** Paid so far, cash register and phone together, net of refunds (0 without payments) */
  paidCents: number;
  /** The bill total with the service charge, only for a comanda with payments (null otherwise) */
  billTotalCents: number | null;
}
export interface SalaoTable { id: string; number: number; sectionId: string | null; sectionName: string | null; capacity: number | null; session: SalaoSession | null }
export interface Salao { sections: Array<{ id: string; name: string }>; tables: SalaoTable[]; others: SalaoSession[]; deliveryNew: number }

const OPEN = ['OPEN', 'SENT_TO_KITCHEN', 'READY'] as const;

export async function loadSalao(restaurantId: string): Promise<Salao> {
  const [tables, sessions, deliveryNew] = await Promise.all([
    prisma.table.findMany({
      where: { restaurantId, isAvailable: true },
      select: { id: true, number: true, capacity: true, section: { select: { id: true, name: true } } },
      orderBy: { number: 'asc' },
    }),
    prisma.orderSession.findMany({
      where: { restaurantId, status: { in: [...OPEN] } },
      select: {
        id: true, tableId: true, tableNumber: true, customerName: true, openedAt: true, status: true, preBillPrintedAt: true, payAtWaiterRequestedAt: true,
        table: { select: { number: true } },
        user: { select: { name: true } },
        items: { select: { price: true, quantity: true, sentAt: true, modifiers: { select: { priceAdjustment: true } } } },
      },
      orderBy: { openedAt: 'asc' },
    }),
    prisma.externalOrder.count({ where: { restaurantId, status: 'PENDING' } }),
  ]);

  // Paid so far (spec 2026-10-10 §5.2): the bill's own numbers, computed only for the comandas that have a
  // payment (cash register or applied phone payment), so a full room without payments costs nothing more
  const ids = sessions.map((s) => s.id);
  const [withCash, withOnline] = ids.length
    ? await Promise.all([
        prisma.cashSessionEntry.findMany({ where: { restaurantId, orderSessionId: { in: ids } }, select: { orderSessionId: true }, distinct: ['orderSessionId'] }),
        prisma.payment.findMany({ where: { restaurantId, orderSessionId: { in: ids }, appliedToBillAt: { not: null } }, select: { orderSessionId: true }, distinct: ['orderSessionId'] }),
      ])
    : [[], []];
  const paidIds = [...new Set([...withCash, ...withOnline].map((r) => r.orderSessionId).filter((id): id is string => !!id))];
  const bills = new Map<string, { paidCents: number; totalCents: number }>();
  await Promise.all(paidIds.map(async (id) => {
    const bill = await loadBill(prisma, restaurantId, id);
    if (bill) bills.set(id, { paidCents: bill.paidCents, totalCents: bill.totalCents });
  }));

  const toSession = (s: (typeof sessions)[number]): SalaoSession => {
    return {
      id: s.id,
      label: sessionLabel(s),
      tableId: s.tableId,
      customerName: s.customerName,
      openedAt: s.openedAt.toISOString(),
      openedBy: s.user?.name ?? null,
      totalCents: s.items.reduce((sum, i) => sum + lineTotalCents(i.price, i.quantity, i.modifiers.map((m) => m.priceAdjustment)), 0),
      itemCount: s.items.length,
      newCount: s.items.filter((i) => !i.sentAt).length,
      status: s.status,
      billRequested: !!s.preBillPrintedAt,
      waiterCalledAt: s.payAtWaiterRequestedAt?.toISOString() ?? null,
      paidCents: bills.get(s.id)?.paidCents ?? 0,
      billTotalCents: bills.get(s.id)?.totalCents ?? null,
    };
  };

  // The oldest open comanda of a table is the table's tile. Another one on the same table (from before
  // the per-table lock, or a QR order) goes with the comandas, labelled with the table: a comanda that
  // is not on the screen is never charged (final review, 2026-10-07)
  const byTable = new Map<string, SalaoSession>();
  const others: SalaoSession[] = [];
  for (const s of sessions) {
    if (s.tableId && !byTable.has(s.tableId)) byTable.set(s.tableId, toSession(s));
    else others.push(toSession(s));
  }

  const sections = new Map<string, string>();
  for (const t of tables) if (t.section) sections.set(t.section.id, t.section.name);

  return {
    sections: [...sections].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    tables: tables.map((t) => ({
      id: t.id,
      number: t.number,
      sectionId: t.section?.id ?? null,
      sectionName: t.section?.name ?? null,
      capacity: t.capacity ?? null,
      session: byTable.get(t.id) ?? null,
    })),
    others,
    deliveryNew,
  };
}
