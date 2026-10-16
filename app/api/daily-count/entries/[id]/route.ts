import { NextResponse } from 'next/server';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { DailyCountError } from '@/lib/daily-count/compute';
import { ENTRY_ROLES, deleteEntry } from '@/lib/daily-count/service';

export const dynamic = 'force-dynamic';

/** DELETE /api/daily-count/entries/[id] - the author within 2 minutes, a manager any time (audited) */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(ENTRY_ROLES, 'Sem acesso à contagem do dia');
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await deleteEntry(auth.member, params.id));
  } catch (error) {
    if (error instanceof DailyCountError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[daily-count] delete failed:', error);
    return NextResponse.json({ error: 'Não foi possível apagar' }, { status: 500 });
  }
}
