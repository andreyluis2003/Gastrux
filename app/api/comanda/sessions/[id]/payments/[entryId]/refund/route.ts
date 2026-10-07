import { NextRequest, NextResponse } from 'next/server';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { CashRuleError } from '@/lib/caixa/rules';
import { refundBillPayment } from '@/lib/comanda/bill-service';

export const dynamic = 'force-dynamic';

/** POST { reason, cashSessionId }: refund one partial payment of an open bill (manager, spec 2026-10-07, 4.3) */
export async function POST(req: NextRequest, { params }: { params: { id: string; entryId: string } }) {
  const auth = await requireRestaurantRole(MANAGER_ROLES, 'Estornar um pagamento exige um gerente');
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({}));
  try {
    return NextResponse.json(await refundBillPayment(auth.member, params.id, params.entryId, { reason: body?.reason, cashSessionId: body?.cashSessionId ?? null }));
  } catch (e) {
    if (e instanceof CashRuleError) return NextResponse.json({ error: e.message, ...(e.code ? { code: e.code } : {}) }, { status: e.status });
    throw e;
  }
}
