import { NextResponse } from 'next/server';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { setDifferenceReason } from '@/lib/caixa/sessions';
import { CASHIER_PLUS } from '@/lib/caixa/roles';
import { cashErrorResponse } from '@/lib/caixa/http';

export const dynamic = 'force-dynamic';

/** POST /api/caixa/sessions/[id]/difference-reason { reason } - why a closed shift has a difference (once). */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(CASHIER_PLUS, 'Sem acesso ao caixa');
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json().catch(() => ({}));
    await setDifferenceReason(auth.member, params.id, body?.reason);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return cashErrorResponse(error, 'difference reason');
  }
}
