import { NextRequest, NextResponse } from 'next/server';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { IfoodError } from '@/lib/ifood/client';
import { IfoodConnectError, disconnect, finishConnection, ifoodState, selectMerchant, setPaused, startConnection } from '@/lib/ifood/connect';

export const dynamic = 'force-dynamic';

const ROLES = [...MANAGER_ROLES, 'ADMIN' as const];
const DENIED = 'O iFood é conectado pelo dono ou pelo gerente';
const NO_STORE = { 'Cache-Control': 'no-store' };

function failure(e: unknown) {
  if (e instanceof IfoodConnectError) return NextResponse.json({ error: e.message, ...e.extra }, { status: e.status });
  if (e instanceof IfoodError) {
    // the iFood refused (bad or expired code, credentials): the restaurant can try again, so 400 rather than 5xx
    return NextResponse.json({ error: e.message }, { status: e.status === 409 ? 409 : e.status >= 500 || e.status === 0 ? 502 : 400 });
  }
  throw e;
}

/** GET /api/admin/integrations/ifood - the connection state (never the tokens) */
export async function GET() {
  const auth = await requireRestaurantRole(ROLES, DENIED);
  if (!auth.ok) return auth.response;
  return NextResponse.json(await ifoodState(auth.member.restaurantId), { headers: NO_STORE });
}

/** POST { action: 'start' | 'finish' | 'select' | 'pause' | 'resume' } */
export async function POST(req: NextRequest) {
  const auth = await requireRestaurantRole(ROLES, DENIED);
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({}));
  try {
    switch (body?.action) {
      case 'start':
        return NextResponse.json(await startConnection(auth.member), { headers: NO_STORE });
      case 'finish':
        return NextResponse.json(await finishConnection(auth.member, body.authorizationCode), { headers: NO_STORE });
      case 'select':
        return NextResponse.json(await selectMerchant(auth.member, body.merchantId), { headers: NO_STORE });
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

/** DELETE - disconnects: clears the store and the tokens */
export async function DELETE() {
  const auth = await requireRestaurantRole(ROLES, DENIED);
  if (!auth.ok) return auth.response;
  return NextResponse.json(await disconnect(auth.member), { headers: NO_STORE });
}
