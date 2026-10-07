import { prisma } from '@/lib/prisma';
import { lineTotalCents } from '@/lib/comanda/line-total';
import { isUnsent, sessionLabel } from './rules';

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
        id: true, tableId: true, tableNumber: true, customerName: true, openedAt: true, sentToKitchenAt: true, status: true,
        table: { select: { number: true } },
        user: { select: { name: true } },
        items: { select: { price: true, quantity: true, addedAt: true, modifiers: { select: { priceAdjustment: true } } } },
      },
      orderBy: { openedAt: 'asc' },
    }),
    prisma.externalOrder.count({ where: { restaurantId, status: 'PENDING' } }),
  ]);

  const toSession = (s: (typeof sessions)[number]): SalaoSession => {
    const sent = s.sentToKitchenAt?.toISOString() ?? null;
    return {
      id: s.id,
      label: sessionLabel(s),
      tableId: s.tableId,
      customerName: s.customerName,
      openedAt: s.openedAt.toISOString(),
      openedBy: s.user?.name ?? null,
      totalCents: s.items.reduce((sum, i) => sum + lineTotalCents(i.price, i.quantity, i.modifiers.map((m) => m.priceAdjustment)), 0),
      itemCount: s.items.length,
      newCount: s.items.filter((i) => isUnsent({ addedAt: i.addedAt.toISOString() }, sent)).length,
      status: s.status,
    };
  };

  // The oldest open comanda of a table wins (there should be one: opening a table returns the open one)
  const byTable = new Map<string, SalaoSession>();
  const others: SalaoSession[] = [];
  for (const s of sessions) {
    if (s.tableId && !byTable.has(s.tableId)) byTable.set(s.tableId, toSession(s));
    else if (!s.tableId) others.push(toSession(s));
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
