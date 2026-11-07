import { NextRequest, NextResponse } from 'next/server';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { applyBulk, parseBulk } from '@/lib/cardapio/bulk';

export const dynamic = 'force-dynamic';

/** POST /api/cardapio/itens/lote { ids, acao, ... } - several menu items at once (spec 2026-11-06 cardapio-rapido) */
export async function POST(req: NextRequest) {
  const auth = await requireRestaurantRole([...MANAGER_ROLES, 'ADMIN'], 'Alterar o cardápio exige um gerente');
  if (!auth.ok) return auth.response;
  const parsed = parseBulk(await req.json().catch(() => ({})));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const out = await applyBulk(auth.member, parsed.ids, parsed.action);
  return NextResponse.json(out.body, { status: out.status, headers: { 'Cache-Control': 'no-store' } });
}
