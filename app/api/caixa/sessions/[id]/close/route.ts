import { NextResponse } from 'next/server';
import { idempotent } from '@/lib/api/idempotency';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { closeSession } from '@/lib/caixa/sessions';
import { CASHIER_PLUS } from '@/lib/caixa/roles';
import { cashErrorResponse } from '@/lib/caixa/http';

export const dynamic = 'force-dynamic';

/** POST /api/caixa/sessions/[id]/close { counted, notes } - blind close (rule 5). */
async function handlePOST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(CASHIER_PLUS, 'Sem acesso ao caixa');
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json().catch(() => ({}));
    return NextResponse.json({ result: await closeSession(auth.member, params.id, { counted: body?.counted ?? {}, notes: body?.notes }) });
  } catch (error) {
    return cashErrorResponse(error, 'close shift');
  }
}
export const POST = idempotent(handlePOST);
