import { NextRequest, NextResponse } from 'next/server';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { ApiKeyError, createApiKey, listApiKeys } from '@/lib/delivery-orders/api-keys';

export const dynamic = 'force-dynamic';

const ROLES = [...MANAGER_ROLES, 'ADMIN' as const];
const DENIED = 'A API de pedidos é configurada pelo dono ou pelo gerente';

/** GET /api/admin/integrations/api-keys - the restaurant's order API keys (never the keys themselves) */
export async function GET() {
  const auth = await requireRestaurantRole(ROLES, DENIED);
  if (!auth.ok) return auth.response;
  return NextResponse.json(await listApiKeys(auth.member), { headers: { 'Cache-Control': 'no-store' } });
}

/** POST /api/admin/integrations/api-keys { name } - a new key, shown once in this response */
export async function POST(req: NextRequest) {
  const auth = await requireRestaurantRole(ROLES, DENIED);
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({}));
  try {
    return NextResponse.json(await createApiKey(auth.member, body?.name), { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof ApiKeyError) return NextResponse.json({ error: e.message, ...e.extra }, { status: e.status });
    throw e;
  }
}
