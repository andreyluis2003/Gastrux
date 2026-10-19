import { prisma } from '@/lib/prisma';
import { sendTransactionalEmail } from '@/lib/email/transactional';
import { effectiveTier, isTierFeatureEnabled } from '@/lib/tier-guard';
import { appBaseUrl } from '@/lib/auth/password-reset';
import { captureException } from '@/lib/sentry';
import { brtToday, dayDate } from './rules';
import { ensureSeries, formatMoney } from './service';

/**
 * The 07h run of contas a pagar (spec 2026-10-18 contas a pagar §6): creates the monthly series' bills and, for a
 * Business restaurant, one bell summary a day (owner and manager) plus an e-mail to the owner.
 */
const DAY_MS = 86_400_000;
// Bill descriptions and names are typed by people (or come from a supplier note): never raw HTML in an e-mail
const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function summaryTitle(today: { count: number; cents: number }, overdue: { count: number; cents: number }, soon: number) {
  const parts: string[] = [];
  if (today.count) parts.push(`${today.count} ${plural(today.count, 'vence', 'vencem')} hoje (${formatMoney(today.cents)})`);
  if (overdue.count) parts.push(`${overdue.count} ${plural(overdue.count, 'atrasada', 'atrasadas')} (${formatMoney(overdue.cents)})`);
  if (soon) parts.push(`${soon} nos próximos 3 dias`);
  return `Contas a pagar: ${parts.join(' · ')}`;
}

export async function morningCheck(now = new Date()): Promise<{ series: number; alerted: number }> {
  let series = 0;
  const withSeries = await prisma.payableSeries.findMany({ where: { active: true }, select: { restaurantId: true }, distinct: ['restaurantId'] });
  // One restaurant failing never stops the others (series here, alerts below)
  for (const r of withSeries) {
    try {
      series += await ensureSeries(r.restaurantId, now);
    } catch (error) {
      report(error, r.restaurantId, 'series');
    }
  }

  const today = brtToday(now);
  const in3 = new Date(Date.parse(`${today}T00:00:00Z`) + 3 * DAY_MS).toISOString().slice(0, 10);
  const due = await prisma.payable.findMany({
    where: { status: 'OPEN', dueDate: { lte: dayDate(in3) } },
    select: { restaurantId: true, dueDate: true, amountCents: true, description: true },
    orderBy: { dueDate: 'asc' },
  });
  const byRestaurant = new Map<string, typeof due>();
  for (const p of due) byRestaurant.set(p.restaurantId, [...(byRestaurant.get(p.restaurantId) ?? []), p]);

  let alerted = 0;
  for (const [restaurantId, list] of byRestaurant) {
    try {
      if (await alertRestaurant(restaurantId, list, today)) alerted++;
    } catch (error) {
      report(error, restaurantId, 'alert');
    }
  }
  return { series, alerted };
}

function report(error: unknown, restaurantId: string, step: string) {
  captureException(error instanceof Error ? error : new Error(String(error)), { endpoint: '/api/payables/morning-check', restaurantId, step });
  console.error(`[payables] morning check ${step} failed for ${restaurantId}:`, error);
}

type DueBill = { dueDate: Date; amountCents: number; description: string };

/** One bell summary a day for a Business restaurant, plus the owner's e-mail. True when it alerted. */
async function alertRestaurant(restaurantId: string, list: DueBill[], today: string): Promise<boolean> {
  const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { subscriptionTier: true, isInternal: true, ownerId: true, name: true } });
  if (!r || !isTierFeatureEnabled(effectiveTier(r), 'payableAlerts')) return false;
  const day = (p: { dueDate: Date }) => p.dueDate.toISOString().slice(0, 10);
  const sum = (sel: DueBill[]) => ({ count: sel.length, cents: sel.reduce((s, p) => s + p.amountCents, 0) });
  const overdue = sum(list.filter((p) => day(p) < today));
  const dueToday = sum(list.filter((p) => day(p) === today));
  // The next 3 days (1 to 3): the same bills the e-mail lists
  const soon = list.filter((p) => day(p) > today).length;
  if (!overdue.count && !dueToday.count && !soon) return false;

  const dedupeKey = `payables:${restaurantId}:${today}`;
  const existing = await prisma.notification.findFirst({ where: { restaurantId, data: { path: ['dedupeKey'], equals: dedupeKey } }, select: { id: true } });
  if (existing) return false;
  const title = summaryTitle(dueToday, overdue, soon);
  const notification = await prisma.notification.create({
    data: {
      restaurantId, type: 'PAYMENT_PENDING', severity: overdue.count ? 'HIGH' : 'MEDIUM', title,
      message: list.slice(0, 5).map((p) => `${p.description}: ${formatMoney(p.amountCents)} (${day(p).split('-').reverse().join('/')})`).join(' · '),
      actionUrl: '/contas-a-pagar', actionLabel: 'Ver contas', data: { kind: 'payables-morning', dedupeKey },
    },
  });
  const owner = await prisma.user.findUnique({ where: { id: r.ownerId }, select: { email: true, name: true } });
  if (!owner?.email) return true;
  try {
    const rows = list.map((p) => `<li>${esc(p.description)}: ${formatMoney(p.amountCents)}, vence em ${day(p).split('-').reverse().join('/')}</li>`).join('');
    await sendTransactionalEmail({
      to: owner.email, subject: title, notificationId: notification.id,
      html: `<p>Olá, ${esc(owner.name || r.name)}.</p><p>${esc(title)}.</p><ul>${rows}</ul><p><a href="${appBaseUrl()}/contas-a-pagar">Ver contas a pagar</a></p>`,
    });
  } catch (error) {
    console.error(`[payables] e-mail to the owner of ${restaurantId} failed`, error);
  }
  return true;
}
