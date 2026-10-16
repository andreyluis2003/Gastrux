import { NextResponse } from 'next/server';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { UtilityError } from '@/lib/utility-bills/rules';
import { updateAccount } from '@/lib/utility-bills/service';

export const dynamic = 'force-dynamic';

/** PATCH /api/utility-bills/accounts/[id] { name?, active? } */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(MANAGER_ROLES, 'Contas de consumo são do dono e do gerente');
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await updateAccount(auth.member, params.id, await request.json().catch(() => ({}))));
  } catch (error) {
    if (error instanceof UtilityError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[utility-bills] account update failed:', error);
    return NextResponse.json({ error: 'Não foi possível alterar a conta' }, { status: 500 });
  }
}
