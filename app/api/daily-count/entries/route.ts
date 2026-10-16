import { NextResponse } from 'next/server';
import { idempotent } from '@/lib/api/idempotency';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { DailyCountError } from '@/lib/daily-count/compute';
import { ENTRY_ROLES, addEntry } from '@/lib/daily-count/service';

export const dynamic = 'force-dynamic';

/** POST /api/daily-count/entries { recipeId, kind: OPENING|MOUNTED|LOSS, quantity, reason?, note? } */
async function handlePOST(request: Request) {
  const auth = await requireRestaurantRole(ENTRY_ROLES, 'Sem acesso à contagem do dia');
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await addEntry(auth.member, body));
  } catch (error) {
    if (error instanceof DailyCountError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[daily-count] entry failed:', error);
    return NextResponse.json({ error: 'Não foi possível lançar' }, { status: 500 });
  }
}

export const POST = idempotent(handlePOST);
