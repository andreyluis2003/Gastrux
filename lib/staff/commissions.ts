import { prisma } from '@/lib/prisma';
import { lineTotalCents } from '@/lib/comanda/line-total';
import { recordAudit, type RestaurantMember } from '@/lib/auth/restaurant-role';
import {
  commissionCents,
  periodContaining,
  ruleLabel,
  type CommissionPeriodType,
  type CommissionRule,
  type PeriodBounds,
} from './commission-rules';

/**
 * Commissions of a restaurant's team (2026-10-06). Rules in ./commission-rules.ts.
 * - salesByStaff: the live view (week or month on screen), computed from closed bills;
 * - closePeriod: freezes a finished pay period into PENDING records (one per person with sales);
 * - updateCommission: approve, mark paid, cancel, or adjust a pending one (bonus or deduction).
 */

export interface StaffSalesRow {
  staffMemberId: string;
  userId: string;
  name: string;
  role: string;
  rule: CommissionRule | null;
  ruleLabel: string;
  bills: number;
  salesCents: number;
  commissionCents: number;
}

function ruleOf(staff: { commissionType: string; commissionValue: unknown }): CommissionRule | null {
  const value = Number(staff.commissionValue ?? 0);
  return value > 0 ? { type: staff.commissionType as CommissionRule['type'], value } : null;
}

/** Sales and commission per team member in a period (closed bills the person opened) */
export async function salesByStaff(restaurantId: string, bounds: PeriodBounds): Promise<StaffSalesRow[]> {
  const [staff, bills] = await Promise.all([
    prisma.staffMember.findMany({
      where: { restaurantId },
      select: { id: true, userId: true, role: true, commissionType: true, commissionValue: true, user: { select: { name: true, email: true } } },
    }),
    prisma.orderSession.findMany({
      where: { restaurantId, status: 'CLOSED', closedAt: { gte: bounds.start, lt: bounds.end } },
      select: { userId: true, items: { select: { price: true, quantity: true, modifiers: { select: { priceAdjustment: true } } } } },
    }),
  ]);

  const byUser = new Map<string, { bills: number; salesCents: number }>();
  for (const bill of bills) {
    const cents = bill.items.reduce((sum, i) => sum + lineTotalCents(i.price, i.quantity, i.modifiers.map((m) => m.priceAdjustment)), 0);
    const acc = byUser.get(bill.userId) ?? { bills: 0, salesCents: 0 };
    acc.bills += 1;
    acc.salesCents += cents;
    byUser.set(bill.userId, acc);
  }

  return staff
    .map((s) => {
      const sold = byUser.get(s.userId) ?? { bills: 0, salesCents: 0 };
      const rule = ruleOf(s);
      return {
        staffMemberId: s.id,
        userId: s.userId,
        name: s.user?.name || s.user?.email || 'Funcionário',
        role: s.role,
        rule,
        ruleLabel: ruleLabel(rule),
        bills: sold.bills,
        salesCents: sold.salesCents,
        commissionCents: commissionCents(rule, sold.salesCents, sold.bills),
      };
    })
    .sort((a, b) => b.salesCents - a.salesCents || a.name.localeCompare(b.name));
}

const dateOnly = (day: string) => new Date(`${day}T00:00:00.000Z`);

export type CloseResult = { ok: true; created: number; updated: number; kept: number } | { ok: false; status: number; error: string };

/**
 * Freezes a finished pay period: one PENDING record per person with sales in it. Running it again
 * refreshes PENDING records (a bill closed late, a rule fixed) and never touches approved, paid or
 * cancelled ones.
 */
export async function closePeriod(member: RestaurantMember, type: CommissionPeriodType, day: string, now = new Date()): Promise<CloseResult> {
  const bounds = periodContaining(type, day);
  if (bounds.end > now) return { ok: false, status: 409, error: 'Este período ainda não terminou. Feche depois do último dia.' };

  const rows = (await salesByStaff(member.restaurantId, bounds)).filter((r) => r.bills > 0);
  let created = 0, updated = 0, kept = 0;
  for (const r of rows) {
    const key = { staffMemberId_periodType_period: { staffMemberId: r.staffMemberId, periodType: type, period: dateOnly(bounds.firstDay) } };
    const existing = await prisma.staffCommission.findUnique({ where: key });
    const values = {
      periodEnd: dateOnly(bounds.lastDay),
      billsCount: r.bills,
      totalSales: r.salesCents / 100,
      commissionEarned: r.commissionCents / 100,
    };
    if (!existing) {
      await prisma.staffCommission.create({
        data: { staffMemberId: r.staffMemberId, periodType: type, period: dateOnly(bounds.firstDay), ...values, bonusEarned: 0, totalEarned: values.commissionEarned },
      });
      created++;
    } else if (existing.status === 'PENDING') {
      const bonus = Number(existing.bonusEarned);
      await prisma.staffCommission.update({ where: { id: existing.id }, data: { ...values, totalEarned: values.commissionEarned + bonus } });
      updated++;
    } else {
      kept++;
    }
  }

  await recordAudit(member, {
    action: 'CREATE',
    entityType: 'StaffCommissionPeriod',
    entityId: `${type}:${bounds.firstDay}`,
    changes: { firstDay: bounds.firstDay, lastDay: bounds.lastDay, created, updated, kept },
  });
  return { ok: true, created, updated, kept };
}

export type CommissionAction =
  | { action: 'approve' }
  | { action: 'pay' }
  | { action: 'cancel'; reason: string }
  | { action: 'adjust'; bonusCents: number; reason: string };

const NEXT: Record<string, string[]> = { approve: ['PENDING'], pay: ['PENDING', 'APPROVED'], cancel: ['PENDING', 'APPROVED'], adjust: ['PENDING'] };

export async function updateCommission(
  member: RestaurantMember,
  id: string,
  change: CommissionAction,
): Promise<{ ok: true; commission: unknown } | { ok: false; status: number; error: string }> {
  // Only this restaurant's records: another restaurant's id is "not found"
  const c = await prisma.staffCommission.findFirst({ where: { id, staffMember: { restaurantId: member.restaurantId } } });
  if (!c) return { ok: false, status: 404, error: 'Comissão não encontrada' };
  if (!NEXT[change.action]?.includes(c.status)) {
    return { ok: false, status: 409, error: `Não é possível ${change.action === 'pay' ? 'pagar' : change.action === 'approve' ? 'aprovar' : change.action === 'cancel' ? 'cancelar' : 'ajustar'} uma comissão com situação ${c.status}` };
  }
  if ((change.action === 'cancel' || change.action === 'adjust') && !(change.reason || '').trim()) {
    return { ok: false, status: 400, error: 'Informe o motivo' };
  }

  let data: Record<string, unknown>;
  if (change.action === 'approve') data = { status: 'APPROVED' };
  else if (change.action === 'pay') data = { status: 'PAID', paidAt: new Date() };
  else if (change.action === 'cancel') data = { status: 'CANCELLED', notes: change.reason.trim() };
  else {
    if (!Number.isInteger(change.bonusCents)) return { ok: false, status: 400, error: 'Valor do ajuste inválido' };
    const bonus = change.bonusCents / 100;
    const total = Number(c.commissionEarned) + bonus;
    if (total < 0) return { ok: false, status: 400, error: 'O ajuste deixaria a comissão negativa' };
    data = { bonusEarned: bonus, totalEarned: total, notes: change.reason.trim() };
  }

  const updated = await prisma.staffCommission.update({ where: { id: c.id }, data });
  await recordAudit(member, {
    action: 'STATUS_CHANGE',
    entityType: 'StaffCommission',
    entityId: c.id,
    changes: { from: c.status, ...change },
  });
  return { ok: true, commission: updated };
}
