import { NextRequest, NextResponse } from 'next/server';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { DeliveryOrderError } from '@/lib/delivery-orders/ingest';
import { DELIVERY_ROLES } from '@/lib/delivery-orders/roles';
import { ifoodCancelReasons } from '@/lib/delivery-orders/platform-sync';

export const dynamic = 'force-dynamic';

/** GET /api/admin/integrations/orders/[id]/cancel-reasons - the iFood reasons to refuse or cancel this order (plan 2026-10-24 ifood, Task 8) */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole([...DELIVERY_ROLES], 'Pedidos de delivery é da equipe do salão e do caixa');
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({ reasons: await ifoodCancelReasons(auth.member, params.id) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof DeliveryOrderError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
