import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { brtDayStart } from '@/lib/staff/commission-rules';
import { addMonths, currentMonth } from '@/lib/utility-bills/rules';
import { FREE_DAYS, FREE_QUESTIONS } from './config';

type Db = Prisma.TransactionClient | typeof prisma;

/** Counted questions of the Brasília month (the plan limit, spec §4.5) */
export async function questionsThisMonth(restaurantId: string, now = new Date(), db: Db = prisma): Promise<number> {
  const ym = currentMonth(now);
  return db.aiQuestion.count({
    where: { restaurantId, counted: true, createdAt: { gte: brtDayStart(`${ym}-01`), lt: brtDayStart(`${addMonths(ym, 1)}-01`) } },
  });
}
/** Questions of the restaurant in the last 60 s (10/min rate, spec §4.5) */
export async function recentRate(restaurantId: string, now = new Date(), db: Db = prisma): Promise<number> {
  return db.aiQuestion.count({ where: { restaurantId, createdAt: { gte: new Date(now.getTime() - 60_000) } } });
}
/** Free onboarding questions already used by the restaurant (spec 2026-10-17 ia-implantacao §3.4) */
export async function freeUsed(restaurantId: string, db: Db = prisma): Promise<number> {
  return db.aiQuestion.count({ where: { restaurantId, free: true } });
}
/** The free quota while it lasts (account up to 30 days old, under 100 free questions), else null */
export async function freeQuota(restaurantId: string, now = new Date()): Promise<{ used: number; limit: number } | null> {
  const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { createdAt: true } });
  if (!r || now.getTime() - r.createdAt.getTime() > FREE_DAYS * 86_400_000) return null;
  const used = await freeUsed(restaurantId);
  return used < FREE_QUESTIONS ? { used, limit: FREE_QUESTIONS } : null;
}
