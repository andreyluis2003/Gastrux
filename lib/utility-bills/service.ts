import { prisma } from '@/lib/prisma';
import { recordAudit, type RestaurantMember } from '@/lib/auth/restaurant-role';
import { isTierFeatureEnabled, restaurantTier } from '@/lib/tier-guard';
import { monthSalesCents } from '@/lib/finance/month-sales';
import {
  addMonths, currentMonth, indicators, KIND_INFO, monthDate, monthOf, parseAmountCents, parseConsumption, parseMonth,
  UtilityError, type BillPoint, type Indicators, type UtilityKind,
} from './rules';
import { alertIfAbove } from './alert';
import { syncUtilityPayable } from '@/lib/payables/service';

const KINDS = Object.keys(KIND_INFO) as UtilityKind[];

async function ownAccount(member: RestaurantMember, id: unknown) {
  if (typeof id !== 'string') throw new UtilityError('Conta não encontrada', 404);
  const account = await prisma.utilityAccount.findFirst({ where: { id, restaurantId: member.restaurantId } });
  if (!account) throw new UtilityError('Conta não encontrada', 404);
  return account;
}

async function assertNameFree(restaurantId: string, name: string, exceptId?: string) {
  const clash = await prisma.utilityAccount.findFirst({
    where: { restaurantId, active: true, name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new UtilityError(`Já existe a conta "${name}"`, 409);
}

export async function createAccount(member: RestaurantMember, body: { kind?: unknown; name?: unknown }) {
  if (typeof body.kind !== 'string' || !KINDS.includes(body.kind as UtilityKind)) throw new UtilityError('Tipo de conta inválido');
  const kind = body.kind as UtilityKind;
  const typed = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : '';
  if (kind === 'OTHER' && !typed) throw new UtilityError('Dê um nome para a conta (ex.: Aluguel)');
  const name = typed || KIND_INFO[kind].label;
  await assertNameFree(member.restaurantId, name);
  const account = await prisma.utilityAccount.create({ data: { restaurantId: member.restaurantId, kind, name }, select: { id: true } });
  return account;
}

export async function updateAccount(member: RestaurantMember, id: string, body: { name?: unknown; active?: unknown }) {
  const account = await ownAccount(member, id);
  const data: { name?: string; active?: boolean } = {};
  if (typeof body.name === 'string' && body.name.trim()) {
    data.name = body.name.trim().slice(0, 60);
    await assertNameFree(member.restaurantId, data.name, account.id);
  }
  if (typeof body.active === 'boolean') {
    if (body.active && !account.active) await assertNameFree(member.restaurantId, data.name ?? account.name, account.id);
    data.active = body.active;
  }
  await prisma.utilityAccount.update({ where: { id: account.id }, data });
  return { ok: true as const };
}

export async function upsertBill(
  member: RestaurantMember,
  body: { accountId?: unknown; referenceMonth?: unknown; amount?: unknown; consumption?: unknown; dueDate?: unknown; notes?: unknown },
  now = new Date(),
) {
  const account = await ownAccount(member, body.accountId);
  if (!account.active) throw new UtilityError('Esta conta está desativada', 409);
  const ym = parseMonth(body.referenceMonth, now);
  const amountCents = parseAmountCents(body.amount);
  const consumption = parseConsumption(body.consumption, account.kind as UtilityKind);
  const dueDate = typeof body.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate) ? new Date(`${body.dueDate}T00:00:00.000Z`) : null;
  const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 300) : null;
  const key = { accountId_referenceMonth: { accountId: account.id, referenceMonth: monthDate(ym) } };
  const previous = await prisma.utilityBill.findUnique({ where: key });
  const bill = await prisma.utilityBill.upsert({
    where: key,
    create: { accountId: account.id, restaurantId: member.restaurantId, referenceMonth: monthDate(ym), amountCents, consumption, dueDate, notes, createdById: member.userId },
    update: { amountCents, consumption, dueDate, notes, updatedById: member.userId },
    select: { id: true },
  });
  if (previous) {
    await recordAudit(member, {
      action: 'UPDATE', entityType: 'UtilityBill', entityId: bill.id,
      changes: { month: ym, before: { amountCents: previous.amountCents, consumption: previous.consumption === null ? null : Number(previous.consumption) }, after: { amountCents, consumption } },
    });
  }
  try {
    // With a due date the bill is also in Contas a pagar (spec 2026-10-18 contas a pagar)
    await syncUtilityPayable(member.restaurantId, bill.id, member.userId);
  } catch (error) {
    console.error('[utility-bills] payable sync failed:', error); // the bill itself is saved
  }
  let alerted = false;
  try {
    alerted = await alertIfAbove(member.restaurantId, account.id, ym);
  } catch (error) {
    console.error('[utility-bills] alert failed:', error); // the bill itself is saved
  }
  return { id: bill.id, corrected: !!previous, alerted };
}

export async function loadScreen(member: RestaurantMember, now = new Date()) {
  const { restaurantId } = member;
  const insights = isTierFeatureEnabled(await restaurantTier(restaurantId), 'utilityInsights');
  const cur = currentMonth(now);
  const accounts = await prisma.utilityAccount.findMany({
    where: { restaurantId },
    orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
    include: { bills: { where: { referenceMonth: { gte: monthDate(addMonths(cur, -14)) } }, orderBy: { referenceMonth: 'desc' } } },
  });
  const salesCache = new Map<string, number>();
  const out = [];
  for (const a of accounts) {
    const kind = a.kind as UtilityKind;
    const bills = a.bills.map((b) => ({
      referenceMonth: monthOf(b.referenceMonth), amountCents: b.amountCents, consumption: b.consumption === null ? null : Number(b.consumption),
      dueDate: b.dueDate ? b.dueDate.toISOString().slice(0, 10) : null, notes: b.notes,
    }));
    let latest: { referenceMonth: string; indicators: Indicators | null } | null = null;
    if (bills.length) {
      const ym = bills[0].referenceMonth;
      let ind: Indicators | null = null;
      if (insights) {
        const points: Record<string, BillPoint> = Object.fromEntries(bills.map((b) => [b.referenceMonth, { amountCents: b.amountCents, consumption: b.consumption }]));
        if (!salesCache.has(ym)) salesCache.set(ym, await monthSalesCents(restaurantId, ym));
        ind = indicators(kind, ym, points, salesCache.get(ym)!);
      }
      latest = { referenceMonth: ym, indicators: ind };
    }
    out.push({ id: a.id, kind, name: a.name, unit: KIND_INFO[kind].unit, active: a.active, bills, latest });
  }
  return { insights, defaultMonth: addMonths(cur, -1), accounts: out };
}
