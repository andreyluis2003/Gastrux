import { NextResponse } from 'next/server';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { ENTRY_ROLES, loadBoard } from '@/lib/daily-count/service';

export const dynamic = 'force-dynamic';

/** GET /api/daily-count - the open night with live rows (spec 2026-10-16 contagem de espetos) */
export async function GET() {
  const auth = await requireRestaurantRole(ENTRY_ROLES, 'Sem acesso à contagem do dia');
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await loadBoard(auth.member), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[daily-count] board failed:', error);
    return NextResponse.json({ error: 'Não foi possível carregar a contagem' }, { status: 500 });
  }
}
