import { NextResponse } from 'next/server';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { prisma } from '@/lib/prisma';
import { monthlyLimit } from '@/lib/ai/config';
import { freeQuota, questionsThisMonth } from '@/lib/ai/usage';
import { brtDayStart } from '@/lib/staff/commission-rules';
import { currentMonth } from '@/lib/utility-bills/rules';

export const dynamic = 'force-dynamic';

/** GET /api/ai/usage - questions of the month (spec §4.6), owner and managers */
export async function GET() {
  const auth = await requireRestaurantRole([...MANAGER_ROLES, 'ADMIN'], 'O uso da IA é do dono e do gerente');
  if (!auth.ok) return auth.response;
  const rid = auth.member.restaurantId;
  const tier = (await prisma.restaurant.findUnique({ where: { id: rid }, select: { subscriptionTier: true } }))?.subscriptionTier || 'starter';
  const rows = await prisma.aiQuestion.findMany({
    where: { restaurantId: rid, createdAt: { gte: brtDayStart(`${currentMonth()}-01`) } },
    orderBy: { createdAt: 'desc' }, take: 50,
    select: { createdAt: true, role: true, question: true, answer: true, model: true, counted: true, free: true, user: { select: { name: true } } },
  });
  return NextResponse.json({
    plan: tier, used: await questionsThisMonth(rid), limit: monthlyLimit(tier), free: await freeQuota(rid),
    questions: rows.map((r) => ({ createdAt: r.createdAt.toISOString(), userName: r.user?.name ?? null, role: r.role, question: r.question, answer: r.answer, model: r.model, counted: r.counted, free: r.free })),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
