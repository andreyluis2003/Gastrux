import { NextRequest, NextResponse } from 'next/server';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { DeliveryOrderError } from '@/lib/delivery-orders/ingest';
import { DELIVERY_ROLES } from '@/lib/delivery-orders/roles';
import { confirmCash } from '@/lib/delivery-orders/platform-sync';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/integrations/orders/[id]/cash - "Recebi o dinheiro": the store got the cash of a 99Food order from
 * 99Food's courier, and 99Food hears it (plan 2026-11-09 99food, Task 5)
 */
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole([...DELIVERY_ROLES], 'Pedidos de delivery é da equipe do salão e do caixa');
  if (!auth.ok) return auth.response;
  try {
    await confirmCash(auth.member, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof DeliveryOrderError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
