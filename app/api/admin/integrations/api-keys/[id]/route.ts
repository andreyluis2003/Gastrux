import { NextRequest, NextResponse } from 'next/server';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { ApiKeyError, revokeApiKey, setCallback } from '@/lib/delivery-orders/api-keys';

export const dynamic = 'force-dynamic';

const ROLES = [...MANAGER_ROLES, 'ADMIN' as const];
const DENIED = 'A API de pedidos é configurada pelo dono ou pelo gerente';

function failure(e: unknown) {
  if (e instanceof ApiKeyError) return NextResponse.json({ error: e.message, ...e.extra }, { status: e.status });
  throw e;
}

/** PATCH /api/admin/integrations/api-keys/[id] { callbackUrl } - where the status changes go (null turns it off) */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(ROLES, DENIED);
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({}));
  try {
    await setCallback(auth.member, params.id, body?.callbackUrl);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}

/** DELETE /api/admin/integrations/api-keys/[id] - revokes the key at once */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(ROLES, DENIED);
  if (!auth.ok) return auth.response;
  try {
    await revokeApiKey(auth.member, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
