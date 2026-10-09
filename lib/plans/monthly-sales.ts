import { prisma } from '@/lib/prisma';
import { getTierLimits } from '@/lib/stripe-config';
import { brtDay, periodContaining, shiftPeriod, type PeriodBounds } from '@/lib/staff/commission-rules';

/**
 * Sales per month per plan (owner decision 2026-10-09, after the competitor research: Anota AI sells
 * by orders per month): Starter 300, Pro 1.500, Business 3.000, Enterprise unlimited.
 *
 * A sale is a closed comanda (table, name, counter, quick sale) or a delivery / online order that is
 * not cancelled (an order with no comanda). Kitchen orders of a comanda are not counted again.
 * Calendar month in Brasília time. Going over never blocks a sale: the owner and managers are warned
 * at 80% and 100% (once each per month), more firmly when the month before was over too.
 */

export interface SalesUsage {
  tier: string;
  /** null = unlimited */
  limit: number | null;
  used: number;
  /** null = unlimited */
  remaining: number | null;
  percent: number;
  month: PeriodBounds;
}

async function countSales(restaurantId: string, month: PeriodBounds): Promise<number> {
  const [comandas, orders] = await Promise.all([
    prisma.orderSession.count({ where: { restaurantId, status: 'CLOSED', closedAt: { gte: month.start, lt: month.end } } }),
    prisma.order.count({
      where: { restaurantId, orderSessionId: null, status: { not: 'CANCELLED' }, createdAt: { gte: month.start, lt: month.end } },
    }),
  ]);
  return comandas + orders;
}

export async function monthlySalesUsage(restaurantId: string, now: Date = new Date()): Promise<SalesUsage> {
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { subscriptionTier: true } });
  const tier = restaurant?.subscriptionTier || 'starter';
  const raw = (getTierLimits(tier) as any).monthlySales ?? 999999;
  const limit = raw >= 999999 ? null : raw;
  const month = periodContaining('MONTHLY', brtDay(now));
  const used = await countSales(restaurantId, month);
  return {
    tier,
    limit,
    used,
    remaining: limit === null ? null : Math.max(0, limit - used),
    percent: limit === null ? 0 : Math.round((used / limit) * 100),
    month,
  };
}

const PLAN_NAMES: Record<string, string> = { starter: 'Starter', pro: 'Pro', business: 'Business', enterprise: 'Enterprise' };

/**
 * Called after a sale. Leaves a restaurant-wide alert (owner and managers see it, lib/notification-utils)
 * the first time the month reaches 80% and 100% of the plan. Never throws: a sale never fails for it.
 */
export async function noteSalesThresholds(restaurantId: string, now: Date = new Date()): Promise<void> {
  try {
    const u = await monthlySalesUsage(restaurantId, now);
    if (u.limit === null || u.percent < 80) return;
    const level = u.percent >= 100 ? 100 : 80;
    const monthKey = u.month.firstDay.slice(0, 7);
    const dedupeKey = `plan-sales:${monthKey}:${level}`;
    const existing = await prisma.notification.findFirst({
      where: { restaurantId, data: { path: ['dedupeKey'], equals: dedupeKey } },
      select: { id: true },
    });
    if (existing) return;

    const plan = PLAN_NAMES[u.tier] || u.tier;
    let title: string;
    let message: string;
    if (level === 80) {
      title = `Você já usou ${u.used} de ${u.limit} vendas do mês`;
      message = `O plano ${plan} inclui ${u.limit} vendas por mês. As vendas continuam normalmente; se o movimento seguir assim, vale conhecer o plano seguinte.`;
    } else {
      const previous = shiftPeriod(u.month, -1);
      const overBefore = (await countSales(restaurantId, previous)) >= u.limit;
      title = `Limite de ${u.limit} vendas do mês atingido`;
      message = overBefore
        ? `É o segundo mês seguido acima das ${u.limit} vendas do plano ${plan}. As vendas continuam funcionando, mas o restaurante precisa mudar de plano.`
        : `O restaurante passou das ${u.limit} vendas do plano ${plan} neste mês. Nenhuma venda é bloqueada; para crescer sem limite, mude de plano.`;
    }
    await prisma.notification.create({
      data: {
        restaurantId,
        type: 'SYSTEM_INFO',
        severity: level === 100 ? 'HIGH' : 'MEDIUM',
        title,
        message,
        actionUrl: '/pricing',
        actionLabel: 'Ver planos',
        data: { kind: 'plan_sales', level, month: monthKey, used: u.used, limit: u.limit, dedupeKey },
      },
    });
  } catch (error) {
    console.error('[plan] could not check the monthly sales:', error);
  }
}
