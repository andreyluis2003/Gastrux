import { prisma } from '@/lib/prisma';
import { isTierFeatureEnabled } from '@/lib/tier-guard';
import { brtDay } from '@/lib/staff/commission-rules';
import { expiryBoard } from './settle';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Every morning (07:00 Brasília, crontab with CRON_SECRET): one restaurant-wide alert (owner and
 * managers see it) per Pro+ restaurant with labels expired or expiring today. One per day.
 */
export async function alertExpiringLabels(now = new Date()) {
  const day = brtDay(now);
  const candidates = await prisma.foodLabel.groupBy({
    by: ['restaurantId'],
    where: { status: 'ACTIVE', expiresAt: { lt: new Date(now.getTime() + 864e5) } },
  });
  let alerted = 0;
  for (const { restaurantId } of candidates) {
    const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { subscriptionTier: true } });
    if (!r || !isTierFeatureEnabled(r.subscriptionTier || 'starter', 'labelExpiry')) continue;
    const board = await expiryBoard(restaurantId, now);
    if (board.expired.length === 0 && board.today.length === 0) continue;
    const dedupeKey = `label-expiry:${day}`;
    const existing = await prisma.notification.findFirst({ where: { restaurantId, data: { path: ['dedupeKey'], equals: dedupeKey } }, select: { id: true } });
    if (existing) continue;
    const parts = [
      board.expired.length ? plural(board.expired.length, 'etiqueta vencida', 'etiquetas vencidas') : null,
      board.today.length ? `${plural(board.today.length, 'vence', 'vencem')} hoje` : null,
    ].filter(Boolean);
    await prisma.notification.create({
      data: {
        restaurantId,
        type: 'SYSTEM_INFO',
        severity: board.expired.length ? 'HIGH' : 'MEDIUM',
        title: parts.join(' e '),
        message: 'Confira as validades e dê baixa no que foi usado ou descartado.',
        actionUrl: '/etiquetas/validades',
        actionLabel: 'Ver validades',
        data: { kind: 'label_expiry', dedupeKey, expired: board.expired.length, today: board.today.length },
      },
    });
    alerted++;
  }
  return { restaurants: candidates.length, alerted };
}
