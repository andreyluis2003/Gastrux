import { NextResponse } from 'next/server';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { idempotent } from '@/lib/api/idempotency';
import { CASHIER_PLUS } from '@/lib/caixa/roles';
import { CashRuleError } from '@/lib/caixa/rules';
import { createEncomenda, listEncomendas } from '@/lib/encomendas/service';

export const dynamic = 'force-dynamic';

/** GET: the encomendas not picked up yet, by pickup time (spec 2026-10-26 encomendas) */
export async function GET() {
  const auth = await requireRestaurantRole(CASHIER_PLUS, 'Encomendas são do caixa');
  if (!auth.ok) return auth.response;
  return NextResponse.json({ encomendas: await listEncomendas(auth.member.restaurantId) });
}

/** POST { customerName, customerPhone?, pickupAt, notes? }: a new encomenda; the items go in on the comanda screen */
async function handlePOST(req: Request) {
  const auth = await requireRestaurantRole(CASHIER_PLUS, 'Encomendas são do caixa');
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({}));
  try {
    return NextResponse.json(await createEncomenda(auth.member, body ?? {}), { status: 201 });
  } catch (e) {
    if (e instanceof CashRuleError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

export const POST = idempotent(handlePOST);
