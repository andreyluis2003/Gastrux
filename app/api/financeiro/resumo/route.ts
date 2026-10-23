import { NextResponse } from 'next/server';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { financeOverview } from '@/lib/finance/overview';

export const dynamic = 'force-dynamic';

/** GET /api/financeiro/resumo - Relatórios > Financeiro (lib/finance/overview.ts), owner and managers */
export async function GET() {
  const auth = await requireRestaurantRole(MANAGER_ROLES, 'O financeiro é do dono e do gerente');
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await financeOverview(auth.member.restaurantId));
  } catch (error) {
    console.error('[financeiro/resumo] failed:', error);
    return NextResponse.json({ error: 'Não foi possível carregar o financeiro' }, { status: 500 });
  }
}
