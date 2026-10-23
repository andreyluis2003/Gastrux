import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { CashRuleError } from '@/lib/caixa/rules';
import { recordAudit, type RestaurantMember } from '@/lib/auth/restaurant-role';
import { isTierFeatureEnabled, restaurantTier } from '@/lib/tier-guard';
import { CASHBACK_DEFAULTS, allocateUse, creditCents, formatPhone, parseSettings } from './rules';

/**
 * Every cashback write (spec docs/superpowers/specs/2026-10-23-cashback-design.md). The bill, the counter sale
 * and the kitchen order pass their transaction (`db`) so the cashback moves with the sale or not at all.
 */
type Db = Prisma.TransactionClient | typeof prisma;

const DAY_MS = 864e5;

export interface CashbackSettingsView {
  enabled: boolean;
  percent: number;
  validityMonths: number;
  minUseCents: number;
  /** The plan has cashback (Business, Enterprise, the 30-day trial) */
  available: boolean;
}

export async function getCashbackSettings(restaurantId: string, db: Db = prisma): Promise<CashbackSettingsView> {
  const [row, tier] = await Promise.all([db.cashbackSettings.findUnique({ where: { restaurantId } }), restaurantTier(restaurantId)]);
  return {
    enabled: row?.enabled ?? CASHBACK_DEFAULTS.enabled,
    percent: row ? Number(row.percent) : CASHBACK_DEFAULTS.percent,
    validityMonths: row?.validityMonths ?? CASHBACK_DEFAULTS.validityMonths,
    minUseCents: row?.minUseCents ?? CASHBACK_DEFAULTS.minUseCents,
    available: isTierFeatureEnabled(tier, 'loyalty'),
  };
}

export async function saveCashbackSettings(member: RestaurantMember, body: unknown): Promise<CashbackSettingsView> {
  const parsed = parseSettings(body);
  if (!parsed.ok) throw new CashRuleError(parsed.error, 400);
  const before = await getCashbackSettings(member.restaurantId);
  await prisma.cashbackSettings.upsert({
    where: { restaurantId: member.restaurantId },
    create: { restaurantId: member.restaurantId, ...parsed.data },
    update: parsed.data,
  });
  await recordAudit(member, { action: 'UPDATE', entityType: 'CashbackSettings', entityId: member.restaurantId, changes: { before, after: parsed.data } });
  return getCashbackSettings(member.restaurantId);
}

export function findCustomerByPhone(db: Db, restaurantId: string, phoneDigits: string) {
  return db.customer.findUnique({ where: { restaurantId_phoneDigits: { restaurantId, phoneDigits } } });
}

/** The customer of this phone in this restaurant; a new phone needs the name */
export async function upsertCustomerByPhone(db: Db, restaurantId: string, phoneDigits: string, name?: string | null) {
  const found = await findCustomerByPhone(db, restaurantId, phoneDigits);
  if (found) return found;
  const clean = typeof name === 'string' ? name.trim().slice(0, 120) : '';
  if (!clean) throw new CashRuleError('Informe o nome do cliente', 400);
  return db.customer.create({ data: { restaurantId, name: clean, phone: formatPhone(phoneDigits), phoneDigits } });
}

const OPEN = (restaurantId: string, customerId: string, now: Date) => ({
  restaurantId, customerId, reversedAt: null, remainingCents: { gt: 0 }, expiresAt: { gt: now },
});

export async function balanceCents(db: Db, restaurantId: string, customerId: string, now = new Date()): Promise<number> {
  const r = await db.cashbackCredit.aggregate({ where: OPEN(restaurantId, customerId, now), _sum: { remainingCents: true } });
  return r._sum.remainingCents ?? 0;
}

function addMonths(d: Date, months: number): Date {
  const out = new Date(d.getTime());
  out.setUTCMonth(out.getUTCMonth() + months);
  return out;
}

/** The credit of one sale (spec §4.b base); 0 when the plan, the rule or a credit already given says no */
export async function creditSale(
  db: Db,
  input: { restaurantId: string; customerId: string; baseCents: number; orderSessionId?: string; orderId?: string; now?: Date },
): Promise<number> {
  const now = input.now ?? new Date();
  const settings = await getCashbackSettings(input.restaurantId, db);
  if (!settings.available || !settings.enabled) return 0;
  const amount = creditCents(input.baseCents, settings.percent);
  if (amount <= 0) return 0;
  const source = input.orderSessionId ? { orderSessionId: input.orderSessionId } : input.orderId ? { orderId: input.orderId } : null;
  if (!source) return 0;
  if (await db.cashbackCredit.findFirst({ where: source, select: { id: true } })) return 0;
  try {
    await db.cashbackCredit.create({
      data: { restaurantId: input.restaurantId, customerId: input.customerId, ...source, amountCents: amount, remainingCents: amount, expiresAt: addMonths(now, settings.validityMonths) },
    });
  } catch (e: any) {
    // Two replays at once: the unique source keeps one credit
    if (e?.code === 'P2002') return 0;
    throw e;
  }
  return amount;
}

/** Use the customer's cashback on a bill, oldest credits first (call under the comanda lock) */
export async function useOnSession(
  db: Db,
  input: { restaurantId: string; customerId: string; orderSessionId: string; cents: number; now?: Date },
): Promise<number> {
  const now = input.now ?? new Date();
  if (!(input.cents > 0)) throw new CashRuleError('Valor de cashback inválido', 400);
  if (await db.cashbackUse.findUnique({ where: { orderSessionId: input.orderSessionId } })) {
    throw new CashRuleError('Esta conta já usa cashback', 409);
  }
  const credits = await db.cashbackCredit.findMany({
    where: OPEN(input.restaurantId, input.customerId, now),
    select: { id: true, remainingCents: true, expiresAt: true, createdAt: true },
  });
  let allocations: Array<{ creditId: string; cents: number }>;
  try {
    allocations = allocateUse(credits, input.cents, now);
  } catch {
    throw new CashRuleError('Saldo insuficiente', 422);
  }
  for (const a of allocations) {
    // Conditional: a credit spent by another bill at the same moment is not spent twice
    const r = await db.cashbackCredit.updateMany({
      where: { id: a.creditId, reversedAt: null, remainingCents: { gte: a.cents } },
      data: { remainingCents: { decrement: a.cents } },
    });
    if (r.count === 0) throw new CashRuleError('Saldo insuficiente', 422);
  }
  await db.cashbackUse.create({
    data: { restaurantId: input.restaurantId, customerId: input.customerId, orderSessionId: input.orderSessionId, amountCents: input.cents, allocations },
  });
  await db.orderSession.update({ where: { id: input.orderSessionId }, data: { cashbackUsedCents: input.cents } });
  return input.cents;
}

/** Gives a bill's cashback back to the credits it came from (a reversed credit gets nothing back) */
export async function removeUse(db: Db, restaurantId: string, orderSessionId: string): Promise<number> {
  const use = await db.cashbackUse.findFirst({ where: { restaurantId, orderSessionId } });
  if (!use) return 0;
  for (const a of (use.allocations as Array<{ creditId: string; cents: number }>) ?? []) {
    await db.cashbackCredit.updateMany({ where: { id: a.creditId, reversedAt: null }, data: { remainingCents: { increment: a.cents } } });
  }
  await db.cashbackUse.update({
    where: { id: use.id },
    data: { reversedAt: new Date(), orderSessionId: null, reversedSessionId: orderSessionId },
  });
  await db.orderSession.update({ where: { id: orderSessionId }, data: { cashbackUsedCents: 0 } });
  return use.amountCents;
}

/**
 * A reopened or cancelled bill: its credit is taken back (what the customer already spent of it cannot be,
 * notReversedCents) and the cashback it used goes back.
 */
export async function reverseForSession(db: Db, restaurantId: string, orderSessionId: string): Promise<{ notReversedCents: number }> {
  let notReversedCents = 0;
  const credit = await db.cashbackCredit.findFirst({ where: { restaurantId, orderSessionId } });
  if (credit) {
    notReversedCents = credit.amountCents - credit.remainingCents;
    await db.cashbackCredit.update({
      where: { id: credit.id },
      data: { remainingCents: 0, reversedAt: new Date(), orderSessionId: null, reversedSessionId: orderSessionId },
    });
  }
  await removeUse(db, restaurantId, orderSessionId);
  return { notReversedCents };
}

/** CRM totals of a sale with a customer (spec §10) */
export async function recordPurchase(db: Db, customerId: string, totalCents: number, at: Date) {
  const c = await db.customer.update({
    where: { id: customerId },
    data: { totalSpent: { increment: totalCents / 100 }, totalOrders: { increment: 1 }, lastOrderAt: at },
    select: { totalSpent: true, totalOrders: true },
  });
  await db.customer.update({ where: { id: customerId }, data: { averageTicket: c.totalOrders > 0 ? Number(c.totalSpent) / c.totalOrders : 0 } });
}

export async function undoPurchase(db: Db, customerId: string, totalCents: number) {
  const c = await db.customer.update({
    where: { id: customerId },
    data: { totalSpent: { decrement: totalCents / 100 }, totalOrders: { decrement: 1 } },
    select: { totalSpent: true, totalOrders: true },
  });
  const orders = Math.max(0, c.totalOrders);
  await db.customer.update({
    where: { id: customerId },
    data: { totalOrders: orders, totalSpent: Math.max(0, Number(c.totalSpent)), averageTicket: orders > 0 ? Math.max(0, Number(c.totalSpent)) / orders : 0 },
  });
}

/** Purchases in the last 90 days: closed bills and completed orders with this customer (the segment) */
export async function customerPurchases90d(restaurantId: string, customerId: string, now = new Date(), db: Db = prisma): Promise<number> {
  const since = new Date(now.getTime() - 90 * DAY_MS);
  const [bills, orders] = await Promise.all([
    db.orderSession.count({ where: { restaurantId, customerId, status: 'CLOSED', closedAt: { gte: since } } }),
    db.order.count({ where: { restaurantId, customerId, orderSessionId: null, status: 'COMPLETED', completedAt: { gte: since } } }),
  ]);
  return bills + orders;
}
