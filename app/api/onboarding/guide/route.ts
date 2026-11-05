import { NextRequest, NextResponse } from 'next/server';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { CHANNELS, MARKS, loadGuide, updateGuide, type Channel, type GuideMark } from '@/lib/onboarding/guide';

export const dynamic = 'force-dynamic';

/** Who sets the restaurant up sees the guide (the same rule as the home's first steps) */
const GUIDE_ROLES = ['OWNER', 'MANAGER', 'ADMIN'] as const;
const DENIED = 'O guia de primeiros passos é do dono e do gerente';

/** GET /api/onboarding/guide - the steps in groups, the progress and whether the guide still shows */
export async function GET() {
  const auth = await requireRestaurantRole([...GUIDE_ROLES], DENIED);
  if (!auth.ok) return auth.response;
  return NextResponse.json(await loadGuide(auth.member.restaurantId), { headers: { 'Cache-Control': 'private, no-store' } });
}

/** PATCH /api/onboarding/guide - { channels } (how the restaurant sells) or { mark } (a new step done) */
export async function PATCH(request: NextRequest) {
  const auth = await requireRestaurantRole([...GUIDE_ROLES], DENIED);
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null);
  const channels = body?.channels;
  const mark = body?.mark;
  const channelsOk = Array.isArray(channels) && channels.every((c: unknown) => CHANNELS.includes(c as Channel));
  const markOk = typeof mark === 'string' && MARKS.includes(mark as GuideMark);
  if (channels !== undefined && !channelsOk) return NextResponse.json({ error: 'Canais inválidos' }, { status: 400 });
  if (mark !== undefined && !markOk) return NextResponse.json({ error: 'Passo inválido' }, { status: 400 });
  if (!channelsOk && !markOk) return NextResponse.json({ error: 'Nada para salvar' }, { status: 400 });
  await updateGuide(auth.member.restaurantId, {
    ...(channelsOk ? { channels: channels as Channel[] } : {}),
    ...(markOk ? { mark: mark as GuideMark } : {}),
  });
  return NextResponse.json(await loadGuide(auth.member.restaurantId));
}
