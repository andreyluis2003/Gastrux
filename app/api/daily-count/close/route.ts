import { NextResponse } from 'next/server';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { DailyCountError } from '@/lib/daily-count/compute';
import { closeNight } from '@/lib/daily-count/close';

export const dynamic = 'force-dynamic';

/** POST /api/daily-count/close { counts: [{ recipeId, counted }] } - owner and manager */
export async function POST(request: Request) {
  const auth = await requireRestaurantRole(MANAGER_ROLES, 'Só o dono ou o gerente fecha a contagem');
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await closeNight(auth.member, body.counts));
  } catch (error) {
    if (error instanceof DailyCountError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[daily-count] close failed:', error);
    return NextResponse.json({ error: 'Não foi possível fechar a contagem' }, { status: 500 });
  }
}
