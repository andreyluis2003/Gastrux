import { NextResponse } from 'next/server';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { batchEntry, StockBatchError } from '@/lib/stock/batch-entry';

export const dynamic = 'force-dynamic';

/** POST /api/stock/batch-entry { batchId, items: [{ ingredientId, quantity, unitCost? }] } - owner and manager (as /api/stock/movement refuses the cook) */
export async function POST(request: Request) {
  const auth = await requireRestaurantRole(MANAGER_ROLES, 'A entrada de estoque é do dono e do gerente');
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await batchEntry(auth.member, await request.json().catch(() => ({}))), { status: 201 });
  } catch (error) {
    if (error instanceof StockBatchError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[stock] batch entry failed:', error);
    return NextResponse.json({ error: 'Não foi possível dar entrada no estoque' }, { status: 500 });
  }
}
