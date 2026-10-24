import { prisma } from '@/lib/prisma';
import { brtYear } from './rules';
import { referralCodeFor } from './signup';

/** What the referring owner sees (plan 2026-10-24 indicacao, Task 7): only the referred restaurants' names */
export const REFERRAL_RULE = 'Ganhe 1 mês grátis para cada restaurante que assinar pelo seu link';
const SITE = 'https://gastrux.com';

export async function myReferrals(restaurantId: string, now = new Date()) {
  const code = await referralCodeFor(restaurantId);
  const rows = await prisma.referral.findMany({
    where: { referrerRestaurantId: restaurantId },
    orderBy: { createdAt: 'desc' },
    select: { status: true, createdAt: true, earnedAt: true, appliedAt: true, referred: { select: { name: true } } },
  });
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  const year = brtYear(now);
  return {
    code,
    link: `${SITE}/?ref=${code}`,
    rule: REFERRAL_RULE,
    counts: { trial: count('TRIAL'), confirming: count('CONFIRMING'), earned: count('EARNED'), applied: count('APPLIED'), cancelled: count('CANCELLED') },
    monthsThisYear: rows.filter((r) => ['EARNED', 'APPLIED'].includes(r.status) && r.earnedAt && brtYear(r.earnedAt) === year).length,
    items: rows.map((r) => ({ restaurantName: r.referred.name, status: r.status, createdAt: r.createdAt, earnedAt: r.earnedAt, appliedAt: r.appliedAt })),
  };
}
