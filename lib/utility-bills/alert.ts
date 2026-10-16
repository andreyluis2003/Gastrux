import { prisma } from '@/lib/prisma';
import { isTierFeatureEnabled } from '@/lib/tier-guard';
import { addMonths, alertText, indicators, monthDate, monthOf, shouldAlert, type BillPoint, type UtilityKind } from './rules';

/** Pro: a bill 20% above the 3 months before its own reference month rings the managers' bell, once per account and month */
export async function alertIfAbove(restaurantId: string, accountId: string, ym: string): Promise<boolean> {
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { subscriptionTier: true } });
  if (!isTierFeatureEnabled(restaurant?.subscriptionTier || 'starter', 'utilityInsights')) return false;
  const account = await prisma.utilityAccount.findFirst({ where: { id: accountId, restaurantId }, select: { kind: true, name: true } });
  if (!account) return false;
  const rows = await prisma.utilityBill.findMany({
    where: { accountId, referenceMonth: { gte: monthDate(addMonths(ym, -3)), lte: monthDate(ym) } },
    select: { referenceMonth: true, amountCents: true, consumption: true },
  });
  const bills: Record<string, BillPoint> = {};
  for (const r of rows) bills[monthOf(r.referenceMonth)] = { amountCents: r.amountCents, consumption: r.consumption === null ? null : Number(r.consumption) };
  if (!bills[ym]) return false;
  const ind = indicators(account.kind as UtilityKind, ym, bills, null);
  if (!shouldAlert(ind)) return false;
  const dedupeKey = `utility:${accountId}:${ym}`;
  const existing = await prisma.notification.findFirst({ where: { restaurantId, data: { path: ['dedupeKey'], equals: dedupeKey } }, select: { id: true } });
  if (existing) return false;
  const text = alertText(account.name, account.kind as UtilityKind, ym, ind);
  await prisma.notification.create({
    data: {
      restaurantId,
      type: 'SYSTEM_INFO',
      severity: 'HIGH',
      title: text.title,
      message: text.message,
      actionUrl: '/dashboard/financeiro/contas',
      actionLabel: 'Ver contas',
      data: { kind: 'utility_above_average', dedupeKey, accountId, month: ym },
    },
  });
  return true;
}
