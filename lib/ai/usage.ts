import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { brtDayStart } from '@/lib/staff/commission-rules';
import { addMonths, currentMonth } from '@/lib/utility-bills/rules';

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
