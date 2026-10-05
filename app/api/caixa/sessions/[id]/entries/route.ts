import { NextResponse } from 'next/server';
import { idempotent } from '@/lib/api/idempotency';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { addEntry } from '@/lib/caixa/sessions';
import { CASHIER_PLUS } from '@/lib/caixa/roles';
import { cashErrorResponse } from '@/lib/caixa/http';

export const dynamic = 'force-dynamic';

/** POST /api/caixa/sessions/[id]/entries - sangria, suprimento, despesa or ajuste (rules 9, 11). */
async function handlePOST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(CASHIER_PLUS, 'Sem acesso ao caixa');
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json().catch(() => ({}));
    const result = await addEntry(auth.member, params.id, {
      type: body?.type, amount: body?.amount, method: body?.method, category: body?.category,
      description: body?.description, direction: body?.direction, force: body?.force === true,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return cashErrorResponse(error, 'add entry');
  }
}
export const POST = idempotent(handlePOST);
