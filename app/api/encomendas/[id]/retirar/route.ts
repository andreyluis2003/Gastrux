import { NextResponse } from 'next/server';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { idempotent } from '@/lib/api/idempotency';
import { CASHIER_PLUS } from '@/lib/caixa/roles';
import { CashRuleError } from '@/lib/caixa/rules';
import { pickUpEncomenda } from '@/lib/encomendas/service';

export const dynamic = 'force-dynamic';

/** POST: "Cliente retirou" (spec 2026-10-26 encomendas): paid, it closes; else it opens to take the rest */
async function handlePOST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(CASHIER_PLUS, 'Encomendas são do caixa');
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await pickUpEncomenda(auth.member, params.id));
  } catch (e) {
    if (e instanceof CashRuleError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

export const POST = idempotent(handlePOST);
