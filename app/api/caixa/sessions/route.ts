import { NextResponse } from 'next/server';
import { idempotent } from '@/lib/api/idempotency';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { listSessions, openSession } from '@/lib/caixa/sessions';
import { CASHIER_PLUS, MANAGER_PLUS } from '@/lib/caixa/roles';
import { cashErrorResponse } from '@/lib/caixa/http';

export const dynamic = 'force-dynamic';

/** POST /api/caixa/sessions { cashRegisterId, openingFloat } - opens the shift (or returns the open one). */
async function handlePOST(request: Request) {
  const auth = await requireRestaurantRole(CASHIER_PLUS, 'Sem acesso ao caixa');
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json().catch(() => ({}));
    const { session, alreadyOpen } = await openSession(auth.member, { cashRegisterId: body?.cashRegisterId, openingFloat: body?.openingFloat });
    return NextResponse.json({ session, alreadyOpen }, { status: alreadyOpen ? 200 : 201 });
  } catch (error) {
    return cashErrorResponse(error, 'open shift');
  }
}
export const POST = idempotent(handlePOST);

const day = (value: string | null, end: boolean) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return new Date(`${value}T${end ? '23:59:59.999' : '00:00:00.000'}-03:00`);
};

/** GET /api/caixa/sessions?from&to&cashRegisterId - shift history (manager). */
export async function GET(request: Request) {
  const auth = await requireRestaurantRole(MANAGER_PLUS, 'O histórico de caixas é do gerente');
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const sessions = await listSessions(auth.member.restaurantId, {
    from: day(url.searchParams.get('from'), false),
    to: day(url.searchParams.get('to'), true),
    cashRegisterId: url.searchParams.get('cashRegisterId') || undefined,
  });
  return NextResponse.json({ sessions });
}
