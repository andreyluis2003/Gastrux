import { NextRequest, NextResponse } from 'next/server';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { CashRuleError } from '@/lib/caixa/rules';
import { moveItems } from '@/lib/comanda/transfer';

export const dynamic = 'force-dynamic';

/** POST { itemIds, tableId? | targetSessionId? }: those lines go to that table or comanda (spec 2026-10-07, 4.4) */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(['OWNER', 'MANAGER', 'CASHIER', 'ADMIN']);
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({}));
  if (!Array.isArray(body?.itemIds) || (!body?.tableId && !body?.targetSessionId)) {
    return NextResponse.json({ error: 'Escolha os itens e o destino' }, { status: 400 });
  }
  try {
    return NextResponse.json(await moveItems(auth.member, params.id, { itemIds: body.itemIds, tableId: body.tableId, targetSessionId: body.targetSessionId }));
  } catch (e) {
    if (e instanceof CashRuleError) return NextResponse.json({ error: e.message, ...(e.code ? { code: e.code } : {}) }, { status: e.status });
    throw e;
  }
}
