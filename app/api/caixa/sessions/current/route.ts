import { NextResponse } from 'next/server';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { currentSessionView } from '@/lib/caixa/sessions';
import { CASHIER_PLUS } from '@/lib/caixa/roles';
import { cashErrorResponse } from '@/lib/caixa/http';

export const dynamic = 'force-dynamic';

/** GET /api/caixa/sessions/current?cashRegisterId= - the open shift of a register, or null. */
export async function GET(request: Request) {
  const auth = await requireRestaurantRole(CASHIER_PLUS, 'Sem acesso ao caixa');
  if (!auth.ok) return auth.response;
  try {
    const id = new URL(request.url).searchParams.get('cashRegisterId') ?? '';
    return NextResponse.json({ view: await currentSessionView(auth.member, id) });
  } catch (error) {
    return cashErrorResponse(error, 'current shift');
  }
}
