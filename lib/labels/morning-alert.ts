import { prisma } from '@/lib/prisma';
import { brtDay, brtDayStart } from '@/lib/staff/commission-rules';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00.000Z`) + 864e5).toISOString().slice(0, 10);

// The plans with the expiry control (lib/tier-guard.ts labelExpiry)
const EXPIRY_TIERS = ['pro', 'business', 'enterprise'];

/**
 * Restaurants to look at: Pro+ with active labels expiring within a day. Filtered by plan in the
 * query: Starter labels can never be settled and stay ACTIVE, so they must not cost the daily run
 * (review of etiquetas 2026-10-09).
 */
export async function labelAlertCandidates(now = new Date()): Promise<string[]> {
  const rows = await prisma.foodLabel.groupBy({
    by: ['restaurantId'],
    where: {
      status: 'ACTIVE',
      expiresAt: { lt: new Date(now.getTime() + 864e5) },
      restaurant: { subscriptionTier: { in: EXPIRY_TIERS } },
    },
  });
  return rows.map((r) => r.restaurantId);
}

/**
 * Every morning (07:00 Brasília, crontab with CRON_SECRET): one restaurant-wide alert (owner and
 * managers see it) per Pro+ restaurant with labels expired or expiring today. One per day.
 */
export async function alertExpiringLabels(now = new Date()) {
  const day = brtDay(now);
  const endToday = brtDayStart(nextDay(day));
  const candidates = await labelAlertCandidates(now);
  let alerted = 0;
  for (const restaurantId of candidates) {
    const dedupeKey = `label-expiry:${day}`;
    const existing = await prisma.notification.findFirst({ where: { restaurantId, data: { path: ['dedupeKey'], equals: dedupeKey } }, select: { id: true } });
    if (existing) continue;
    // Two counts, not the whole board: the alert needs only how many
    const [expired, today] = await Promise.all([
      prisma.foodLabel.count({ where: { restaurantId, status: 'ACTIVE', expiresAt: { lte: now } } }),
      prisma.foodLabel.count({ where: { restaurantId, status: 'ACTIVE', expiresAt: { gt: now, lt: endToday } } }),
    ]);
    if (expired === 0 && today === 0) continue;
    const parts = [
      expired ? plural(expired, 'etiqueta vencida', 'etiquetas vencidas') : null,
      today ? `${plural(today, 'vence', 'vencem')} hoje` : null,
    ].filter(Boolean);
    await prisma.notification.create({
      data: {
        restaurantId,
        type: 'SYSTEM_INFO',
        severity: expired ? 'HIGH' : 'MEDIUM',
        title: parts.join(' e '),
        message: 'Confira as validades e dê baixa no que foi usado ou descartado.',
        actionUrl: '/etiquetas/validades',
        actionLabel: 'Ver validades',
        data: { kind: 'label_expiry', dedupeKey, expired, today },
      },
    });
    alerted++;
  }
  return { restaurants: candidates.length, alerted };
}
