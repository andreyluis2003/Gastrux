import { NextResponse } from 'next/server';
import { recordAudit, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { CASHIER_PLUS, MANAGER_PLUS } from '@/lib/caixa/roles';
import { cashErrorResponse } from '@/lib/caixa/http';
import { createDriver, listDrivers } from '@/lib/delivery/drivers';

export const dynamic = 'force-dynamic';

/** GET /api/delivery/drivers[?all=1] - the restaurant's drivers (active only unless all=1). The cashier reads it too. */
export async function GET(request: Request) {
  const auth = await requireRestaurantRole(CASHIER_PLUS, 'Sem acesso aos entregadores');
  if (!auth.ok) return auth.response;
  try {
    const includeInactive = new URL(request.url).searchParams.get('all') === '1';
    return NextResponse.json({ drivers: await listDrivers(auth.member.restaurantId, { includeInactive }), role: auth.member.role });
  } catch (error) {
    return cashErrorResponse(error, 'list drivers');
  }
}

/** POST /api/delivery/drivers { name, phone?, dailyRate?, perDelivery? } - a new driver (manager); values in reais. */
export async function POST(request: Request) {
  const auth = await requireRestaurantRole(MANAGER_PLUS, 'Cadastrar entregador exige um gerente');
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json().catch(() => ({}));
    const driver = await createDriver(auth.member.restaurantId, body ?? {});
    await recordAudit(auth.member, {
      action: 'CREATE', entityType: 'Driver', entityId: driver.id,
      changes: { name: driver.name, phone: driver.phone, dailyRateCents: driver.dailyRateCents, perDeliveryCents: driver.perDeliveryCents },
    });
    return NextResponse.json({ driver }, { status: 201 });
  } catch (error) {
    return cashErrorResponse(error, 'create driver');
  }
}
