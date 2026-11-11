import { NextResponse } from 'next/server';
import { requireRestaurantRole, MANAGER_ROLES } from '@/lib/auth/restaurant-role';
import { CashRuleError } from '@/lib/caixa/rules';
import { cancelWeeklyOrder } from '@/lib/weekly-menu/service';

export const dynamic = 'force-dynamic';

/** POST { reason }: cancel a PLACED pre-order and free its portions and coupon */
export async function POST(req: Request, { params }: { params: { id: string; orderId: string } }) {
  const auth = await requireRestaurantRole(MANAGER_ROLES, 'Alterar o cardápio exige um gerente');
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({}));
  try {
    return NextResponse.json(await cancelWeeklyOrder(auth.member.restaurantId, params.id, params.orderId, body?.reason));
  } catch (e) {
    if (e instanceof CashRuleError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
