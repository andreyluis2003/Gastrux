import { prisma } from '@/lib/prisma';
import { CASH_METHODS, METHOD_KEY, METHOD_LABEL, type CashMethod } from './payment-methods';
import { salesSummary, type EntryType } from './rules';
import { ENTRY_TYPE_LABEL } from './labels';

async function nameOf(userId: string | null) {
  if (!userId) return null;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
  return u ? u.name || u.email : null;
}

export async function buildCashEntryTicket(restaurantId: string, entryId: string) {
  const e = await prisma.cashSessionEntry.findFirst({
    where: { id: entryId, restaurantId },
    include: { cashSession: { include: { cashRegister: { select: { name: true } } } } },
  });
  if (!e) return null;
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } });
  return {
    restaurantName: restaurant?.name ?? '',
    registerName: e.cashSession.cashRegister.name,
    typeLabel: ENTRY_TYPE_LABEL[e.type as EntryType],
    amountCents: e.amountCents,
    methodLabel: METHOD_LABEL[e.method as CashMethod],
    category: e.category,
    description: e.description,
    createdByName: await nameOf(e.createdById),
    createdAt: e.createdAt.toISOString(),
    entryId: e.id,
  };
}

export async function buildCashCloseTicket(restaurantId: string, sessionId: string) {
  const s = await prisma.cashSession.findFirst({
    where: { id: sessionId, restaurantId, status: 'CLOSED' },
    include: { cashRegister: { select: { name: true } }, entries: true },
  });
  if (!s) return null;
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } });
  const expected = (s.expectedCents ?? {}) as Record<string, number>;
  const counted = (s.countedCents ?? {}) as Record<string, number>;
  const difference = (s.differenceCents ?? {}) as Record<string, number>;
  const sales = salesSummary(s.entries.map((e) => ({ type: e.type as EntryType, method: e.method as CashMethod, amountCents: e.amountCents, direction: e.direction as any, orderSessionId: e.orderSessionId })));
  return {
    restaurantName: restaurant?.name ?? '',
    registerName: s.cashRegister.name,
    openedAt: s.openedAt.toISOString(),
    closedAt: s.closedAt?.toISOString() ?? null,
    openedByName: await nameOf(s.openedById),
    closedByName: await nameOf(s.closedById),
    openingFloatCents: s.openingFloatCents,
    rows: CASH_METHODS.map((m) => ({ label: METHOD_LABEL[m], expected: expected[METHOD_KEY[m]] ?? 0, counted: counted[METHOD_KEY[m]] ?? 0, difference: difference[METHOD_KEY[m]] ?? 0 }))
      .filter((r) => r.expected || r.counted || r.label === 'Dinheiro'),
    sales: { totalCents: sales.totalCents, salesCount: sales.salesCount },
    notes: s.closingNotes,
    lateEntries: s.lateEntries,
  };
}

export type CashEntryTicket = NonNullable<Awaited<ReturnType<typeof buildCashEntryTicket>>>;
export type CashCloseTicket = NonNullable<Awaited<ReturnType<typeof buildCashCloseTicket>>>;
