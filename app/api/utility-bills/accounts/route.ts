import { NextResponse } from 'next/server';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { UtilityError } from '@/lib/utility-bills/rules';
import { createAccount } from '@/lib/utility-bills/service';

export const dynamic = 'force-dynamic';

/** POST /api/utility-bills/accounts { kind, name? } */
export async function POST(request: Request) {
  const auth = await requireRestaurantRole(MANAGER_ROLES, 'Contas de consumo são do dono e do gerente');
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await createAccount(auth.member, await request.json().catch(() => ({}))));
  } catch (error) {
    if (error instanceof UtilityError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[utility-bills] account failed:', error);
    return NextResponse.json({ error: 'Não foi possível criar a conta' }, { status: 500 });
  }
}
