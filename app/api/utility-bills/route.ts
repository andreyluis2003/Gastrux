import { NextResponse } from 'next/server';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { UtilityError } from '@/lib/utility-bills/rules';
import { loadScreen, upsertBill } from '@/lib/utility-bills/service';

export const dynamic = 'force-dynamic';
const DENIED = 'Contas de consumo são do dono e do gerente';

/** GET /api/utility-bills - accounts, last 14 months and (Pro) indicators */
export async function GET() {
  const auth = await requireRestaurantRole(MANAGER_ROLES, DENIED);
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await loadScreen(auth.member), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[utility-bills] screen failed:', error);
    return NextResponse.json({ error: 'Não foi possível carregar as contas' }, { status: 500 });
  }
}

/** PUT /api/utility-bills { accountId, referenceMonth: 'YYYY-MM', amount, consumption?, dueDate?, notes? } - enter or correct */
export async function PUT(request: Request) {
  const auth = await requireRestaurantRole(MANAGER_ROLES, DENIED);
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await upsertBill(auth.member, await request.json().catch(() => ({}))));
  } catch (error) {
    if (error instanceof UtilityError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[utility-bills] save failed:', error);
    return NextResponse.json({ error: 'Não foi possível salvar a conta' }, { status: 500 });
  }
}
