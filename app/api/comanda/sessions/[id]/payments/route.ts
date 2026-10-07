import { NextResponse } from 'next/server';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { idempotent } from '@/lib/api/idempotency';
import { CASHIER_PLUS } from '@/lib/caixa/roles';
import { CashRuleError } from '@/lib/caixa/rules';
import { recordBillPayment } from '@/lib/comanda/bill-service';

export const dynamic = 'force-dynamic';

/**
 * POST { payments: [{ method, amount }], cashSessionId, customerCPF?, dueCents? }: one payment towards
 * the bill; closes it when paid (spec 2026-10-07, 4.3). dueCents is the share being paid now (change is
 * counted against it). Needs the internet: never queued offline. With an Idempotency-Key, the same
 * payment sent twice (lost answer, a second tap) is recorded once.
 */
async function handlePOST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(CASHIER_PLUS, 'Receber exige o caixa');
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({}));
  try {
    return NextResponse.json(await recordBillPayment(auth.member, params.id, {
      payments: body?.payments,
      cashSessionId: body?.cashSessionId ?? null,
      customerCPF: body?.customerCPF ?? null,
      dueCents: Number.isInteger(body?.dueCents) ? body.dueCents : null,
    }));
  } catch (e) {
    if (e instanceof CashRuleError) return NextResponse.json({ error: e.message, ...(e.code ? { code: e.code } : {}) }, { status: e.status });
    throw e;
  }
}

export const POST = idempotent(handlePOST);
