import { NextRequest, NextResponse } from 'next/server';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { CashRuleError } from '@/lib/caixa/rules';
import { markPreBill } from '@/lib/comanda/bill-service';

export const dynamic = 'force-dynamic';

/** POST: the pre-bill is being printed (any front-of-house member, the waiter included) — spec 2026-10-07, 4.3 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(['OWNER', 'MANAGER', 'CASHIER', 'ADMIN']);
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await markPreBill(auth.member, params.id));
  } catch (e) {
    if (e instanceof CashRuleError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
