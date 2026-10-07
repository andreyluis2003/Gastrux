import { NextRequest, NextResponse } from 'next/server';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { CASHIER_PLUS } from '@/lib/caixa/roles';
import { CashRuleError } from '@/lib/caixa/rules';
import { recordBillPayment } from '@/lib/comanda/bill-service';

export const dynamic = 'force-dynamic';

/**
 * POST { payments: [{ method, amount }], cashSessionId, customerCPF? }: one payment towards the bill;
 * closes it when paid (spec 2026-10-07, 4.3). Needs the internet: never queued offline.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(CASHIER_PLUS, 'Receber exige o caixa');
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({}));
  try {
    return NextResponse.json(await recordBillPayment(auth.member, params.id, {
      payments: body?.payments,
      cashSessionId: body?.cashSessionId ?? null,
      customerCPF: body?.customerCPF ?? null,
    }));
  } catch (e) {
    if (e instanceof CashRuleError) return NextResponse.json({ error: e.message, ...(e.code ? { code: e.code } : {}) }, { status: e.status });
    throw e;
  }
}
