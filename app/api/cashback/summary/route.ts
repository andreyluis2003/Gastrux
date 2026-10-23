import { NextResponse } from 'next/server';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { cashbackSummary } from '@/lib/cashback/crm';

export const dynamic = 'force-dynamic';

/** GET - the Cashback screen's numbers and last movements (lib/cashback/crm.ts) */
export async function GET() {
  const auth = await requireRestaurantRole(MANAGER_ROLES, 'O cashback é do dono e do gerente');
  if (!auth.ok) return auth.response;
  return NextResponse.json(await cashbackSummary(auth.member.restaurantId));
}
