import { NextRequest, NextResponse } from 'next/server';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { CashRuleError } from '@/lib/caixa/rules';
import { TableBusyError, transferTable } from '@/lib/comanda/transfer';

export const dynamic = 'force-dynamic';

/** POST { tableId }: the whole comanda goes to that table (spec 2026-10-07, 4.4) */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(['OWNER', 'MANAGER', 'CASHIER', 'ADMIN']);
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({}));
  if (typeof body?.tableId !== 'string') return NextResponse.json({ error: 'Escolha a mesa' }, { status: 400 });
  try {
    return NextResponse.json(await transferTable(auth.member, params.id, body.tableId));
  } catch (e) {
    if (e instanceof TableBusyError) return NextResponse.json({ error: e.message, code: e.code, targetSessionId: e.targetSessionId }, { status: 409 });
    if (e instanceof CashRuleError) return NextResponse.json({ error: e.message, ...(e.code ? { code: e.code } : {}) }, { status: e.status });
    throw e;
  }
}
