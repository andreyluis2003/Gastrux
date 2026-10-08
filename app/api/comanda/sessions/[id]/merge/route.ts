import { NextRequest, NextResponse } from 'next/server';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { CashRuleError } from '@/lib/caixa/rules';
import { mergeSessions } from '@/lib/comanda/transfer';

export const dynamic = 'force-dynamic';

/** POST { sourceSessionId }: that comanda comes into this one (spec 2026-10-07, 4.4) */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(['OWNER', 'MANAGER', 'CASHIER', 'ADMIN']);
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({}));
  if (typeof body?.sourceSessionId !== 'string') return NextResponse.json({ error: 'Escolha a comanda para juntar' }, { status: 400 });
  try {
    return NextResponse.json(await mergeSessions(auth.member, params.id, body.sourceSessionId));
  } catch (e) {
    if (e instanceof CashRuleError) return NextResponse.json({ error: e.message, ...(e.code ? { code: e.code } : {}) }, { status: e.status });
    throw e;
  }
}
