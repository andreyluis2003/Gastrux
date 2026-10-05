import { NextResponse } from 'next/server';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { getSessionView } from '@/lib/caixa/sessions';
import { CASHIER_PLUS, isManager } from '@/lib/caixa/roles';

export const dynamic = 'force-dynamic';

/** GET /api/caixa/sessions/[id] - shift detail: managers any shift, a cashier only an open one. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(CASHIER_PLUS, 'Sem acesso ao caixa');
  if (!auth.ok) return auth.response;
  const view = await getSessionView(auth.member, params.id);
  if (!view) return NextResponse.json({ error: 'Caixa não encontrado' }, { status: 404 });
  if (!isManager(auth.member.role) && view.session.status !== 'OPEN') {
    return NextResponse.json({ error: 'O histórico de caixas é do gerente' }, { status: 403 });
  }
  return NextResponse.json({ view });
}
