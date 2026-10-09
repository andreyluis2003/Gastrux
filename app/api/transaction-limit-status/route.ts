// @ts-nocheck
import { NextResponse } from 'next/server';
import { getRestaurantMember } from '@/lib/auth/restaurant-role';
import { monthlySalesUsage } from '@/lib/plans/monthly-sales';

export const dynamic = 'force-dynamic';

/**
 * The restaurant's sales of the month against its plan (owner decision 2026-10-09). It used to count
 * per-user "transactions" (stock movements, reports) by the user's own tier, so everyone stopped at 50
 * a day. Field names kept for the screens that read it; nothing is ever blocked by it.
 */
export async function GET() {
  const member = await getRestaurantMember();
  if (!member) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const u = await monthlySalesUsage(member.restaurantId);
  const limit = u.limit ?? 999999;
  return NextResponse.json({
    kind: 'monthlySales',
    allowed: true,
    tier: u.tier,
    currentTier: u.tier,
    limit,
    currentCount: u.used,
    current_count: u.used,
    remaining: u.remaining ?? 999999,
    percent: u.percent,
    month: u.month.firstDay.slice(0, 7),
    message: u.limit === null ? 'Vendas ilimitadas no seu plano' : `${u.used} de ${u.limit} vendas do mês`,
  });
}
