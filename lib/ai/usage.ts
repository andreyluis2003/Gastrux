import { prisma } from '@/lib/prisma';
import { brtDayStart } from '@/lib/staff/commission-rules';
import { addMonths, currentMonth } from '@/lib/utility-bills/rules';

/** Counted questions of the Brasília month (the plan limit, spec §4.5) */
export async function questionsThisMonth(restaurantId: string, now = new Date()): Promise<number> {
  const ym = currentMonth(now);
  return prisma.aiQuestion.count({
    where: { restaurantId, counted: true, createdAt: { gte: brtDayStart(`${ym}-01`), lt: brtDayStart(`${addMonths(ym, 1)}-01`) } },
  });
}
