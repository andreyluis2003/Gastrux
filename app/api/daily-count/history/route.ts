import { NextRequest, NextResponse } from 'next/server';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { loadHistory } from '@/lib/daily-count/history';
import { ENTRY_ROLES } from '@/lib/daily-count/service';

export const dynamic = 'force-dynamic';

/** GET /api/daily-count/history?weeks=4 */
export async function GET(request: NextRequest) {
  const auth = await requireRestaurantRole(ENTRY_ROLES, 'Sem acesso à contagem do dia');
  if (!auth.ok) return auth.response;
  const weeks = Number(new URL(request.url).searchParams.get('weeks') || 4) || 4;
  try {
    return NextResponse.json(await loadHistory(auth.member.restaurantId, weeks), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[daily-count] history failed:', error);
    return NextResponse.json({ error: 'Não foi possível carregar o histórico' }, { status: 500 });
  }
}
