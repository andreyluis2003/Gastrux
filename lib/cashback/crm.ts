import { prisma } from '@/lib/prisma';
import { brtDay, brtDayStart } from '@/lib/staff/commission-rules';
import { segmentOf, type Segment } from './rules';

/**
 * Reads for the Cashback screen and the CRM (spec 2026-10-23 §9, §10). The segment is computed when read,
 * from the purchases of the last 90 days, so it never goes stale.
 */
const DAY_MS = 864e5;

/** Purchases in the last 90 days of every customer of the restaurant that bought: closed bills + completed orders */
export async function purchaseCounts90d(restaurantId: string, now = new Date()): Promise<Map<string, number>> {
  const since = new Date(now.getTime() - 90 * DAY_MS);
  const [bills, orders] = await Promise.all([
    prisma.orderSession.groupBy({ by: ['customerId'], where: { restaurantId, customerId: { not: null }, status: 'CLOSED', closedAt: { gte: since } }, _count: true }),
    prisma.order.groupBy({ by: ['customerId'], where: { restaurantId, customerId: { not: null }, orderSessionId: null, status: 'COMPLETED', completedAt: { gte: since } }, _count: true }),
  ]);
  const out = new Map<string, number>();
  for (const r of [...bills, ...orders]) if (r.customerId) out.set(r.customerId, (out.get(r.customerId) ?? 0) + (r._count as number));
  return out;
}

export function segmentFor(counts: Map<string, number>, customerId: string): Segment {
  return segmentOf(counts.get(customerId) ?? 0);
}

export interface StatementLine {
  kind: 'CREDIT' | 'USE';
  amountCents: number;
  at: string;
  /** Credit: until when it can be used; null for uses */
  expiresAt: string | null;
  reversed: boolean;
  customerName?: string;
}

/** The movements of one customer, or of the restaurant (the last `take`), newest first */
export async function cashbackStatement(restaurantId: string, customerId: string | null, take = 50): Promise<StatementLine[]> {
  const where = { restaurantId, ...(customerId ? { customerId } : {}) };
  const [credits, uses] = await Promise.all([
    prisma.cashbackCredit.findMany({ where, orderBy: { createdAt: 'desc' }, take, include: { customer: { select: { name: true } } } }),
    prisma.cashbackUse.findMany({ where, orderBy: { createdAt: 'desc' }, take, include: { customer: { select: { name: true } } } }),
  ]);
  return [
    ...credits.map((c) => ({ kind: 'CREDIT' as const, amountCents: c.amountCents, at: c.createdAt.toISOString(), expiresAt: c.expiresAt.toISOString(), reversed: !!c.reversedAt, customerName: c.customer.name })),
    ...uses.map((u) => ({ kind: 'USE' as const, amountCents: u.amountCents, at: u.createdAt.toISOString(), expiresAt: null, reversed: !!u.reversedAt, customerName: u.customer.name })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, take);
}

/** The Cashback screen's numbers: this month (Brasília) credited and used, open balance, expiring in 30 days */
export async function cashbackSummary(restaurantId: string, now = new Date()) {
  const monthStart = brtDayStart(`${brtDay(now).slice(0, 8)}01`);
  const open = { restaurantId, reversedAt: null, remainingCents: { gt: 0 }, expiresAt: { gt: now } };
  const [credited, used, openSum, expiring, movements] = await Promise.all([
    prisma.cashbackCredit.aggregate({ where: { restaurantId, reversedAt: null, createdAt: { gte: monthStart } }, _sum: { amountCents: true } }),
    prisma.cashbackUse.aggregate({ where: { restaurantId, reversedAt: null, createdAt: { gte: monthStart } }, _sum: { amountCents: true } }),
    prisma.cashbackCredit.aggregate({ where: open, _sum: { remainingCents: true } }),
    prisma.cashbackCredit.aggregate({ where: { ...open, expiresAt: { gt: now, lte: new Date(now.getTime() + 30 * DAY_MS) } }, _sum: { remainingCents: true } }),
    cashbackStatement(restaurantId, null, 20),
  ]);
  return {
    creditedMonthCents: credited._sum.amountCents ?? 0,
    usedMonthCents: used._sum.amountCents ?? 0,
    openCents: openSum._sum.remainingCents ?? 0,
    expiringCents: expiring._sum.remainingCents ?? 0,
    movements,
  };
}
