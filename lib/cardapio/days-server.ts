import { prisma } from '@/lib/prisma';
import { offeredOn, weekdayIn } from './days';

/** Prisma filter for today in the restaurant's time zone */
export async function offeredToday(restaurantId: string, now = new Date()) {
  const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { timezone: true } });
  return offeredOn(weekdayIn(r?.timezone ?? 'America/Sao_Paulo', now));
}
