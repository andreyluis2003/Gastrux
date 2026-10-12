import { NextRequest, NextResponse } from 'next/server';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { CashRuleError } from '@/lib/caixa/rules';
import { releaseEmptyComanda } from '@/lib/comanda/release-empty';

export const dynamic = 'force-dynamic';

/** POST: frees the table of a comanda left with nothing on it (lib/comanda/release-empty.ts). Any staff, no reason. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(['OWNER', 'MANAGER', 'CASHIER', 'COOK', 'ADMIN']);
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await releaseEmptyComanda(auth.member, params.id));
  } catch (error) {
    if (error instanceof CashRuleError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[comanda release]', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
