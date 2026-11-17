import { NextResponse } from 'next/server';
import { idempotent } from '@/lib/api/idempotency';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { pendingByDriver, settleDriver } from '@/lib/caixa/driver-settlement';
import { CASHIER_PLUS } from '@/lib/caixa/roles';
import { cashErrorResponse } from '@/lib/caixa/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/caixa/sessions/[id]/acerto-entregador - { drivers, driverNames, pay }: what each driver brings back (door
 * money, spec 2026-10-26) and what each driver earned (daily rates + deliveries, spec 2026-11-17 entregadores).
 */
export async function GET(_request: Request) {
  const auth = await requireRestaurantRole(CASHIER_PLUS, 'Sem acesso ao caixa');
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await pendingByDriver(auth.member.restaurantId), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return cashErrorResponse(error, 'driver settlement list');
  }
}

/**
 * POST - { driverName?, orderIds?, receivedCash?, driverPay?, reason?, pay?: { key, amount } }: orderIds brings the door
 * money to this open shift; pay pays the driver (cash Despesa). driverPay is the old typed-name payment.
 */
async function handlePOST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(CASHIER_PLUS, 'Sem acesso ao caixa');
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await settleDriver(auth.member, params.id, body ?? {}), { status: 201 });
  } catch (error) {
    return cashErrorResponse(error, 'driver settlement');
  }
}
export const POST = idempotent(handlePOST);
