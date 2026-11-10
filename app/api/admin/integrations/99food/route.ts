import { NextRequest, NextResponse } from 'next/server';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { NinetynineError } from '@/lib/ninetynine/client';
import {
  NinetynineConnectError, cancelRequest, candidateStores, disconnect, ninetynineState, selectStore, setPaused, startConnection,
} from '@/lib/ninetynine/connect';

export const dynamic = 'force-dynamic';

const ROLES = [...MANAGER_ROLES, 'ADMIN' as const];
const DENIED = 'A 99Food é conectada pelo dono ou pelo gerente';
const NO_STORE = { 'Cache-Control': 'no-store' };

function failure(e: unknown) {
  if (e instanceof NinetynineConnectError) return NextResponse.json({ error: e.message, ...e.extra }, { status: e.status });
  // the 99Food refused or did not answer: the restaurant can try again
  if (e instanceof NinetynineError) return NextResponse.json({ error: 'A 99Food não respondeu, tente de novo' }, { status: 502 });
  throw e;
}

/** GET /api/admin/integrations/99food - the connection state (never the token) */
export async function GET() {
  const auth = await requireRestaurantRole(ROLES, DENIED);
  if (!auth.ok) return auth.response;
  return NextResponse.json(await ninetynineState(auth.member.restaurantId), { headers: NO_STORE });
}

/** POST { action: 'start' | 'stores' | 'select' (records a link request for the staff) | 'cancel' (that request) | 'pause' | 'resume' } */
export async function POST(req: NextRequest) {
  const auth = await requireRestaurantRole(ROLES, DENIED);
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({}));
  try {
    switch (body?.action) {
      case 'start':
        return NextResponse.json(await startConnection(auth.member), { headers: NO_STORE });
      case 'stores':
        return NextResponse.json({ stores: await candidateStores(auth.member) }, { headers: NO_STORE });
      case 'select':
        return NextResponse.json(await selectStore(auth.member, body.appShopId), { headers: NO_STORE });
      case 'cancel':
        return NextResponse.json(await cancelRequest(auth.member), { headers: NO_STORE });
      case 'pause':
      case 'resume':
        return NextResponse.json(await setPaused(auth.member, body.action === 'pause'), { headers: NO_STORE });
      default:
        return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });
    }
  } catch (e) {
    return failure(e);
  }
}

/** DELETE - disconnects: clears the store and the token */
export async function DELETE() {
  const auth = await requireRestaurantRole(ROLES, DENIED);
  if (!auth.ok) return auth.response;
  return NextResponse.json(await disconnect(auth.member), { headers: NO_STORE });
}
