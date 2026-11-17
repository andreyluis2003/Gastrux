import { NextResponse } from 'next/server';
import { recordAudit, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { MANAGER_PLUS } from '@/lib/caixa/roles';
import { cashErrorResponse } from '@/lib/caixa/http';
import { updateDriver } from '@/lib/delivery/drivers';

export const dynamic = 'force-dynamic';

/** PATCH /api/delivery/drivers/[id] { name?, phone?, dailyRate?, perDelivery?, active? } - edit or (de)activate (manager). */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(MANAGER_PLUS, 'Alterar entregador exige um gerente');
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json().catch(() => ({}));
    const { name, phone, dailyRate, perDelivery, active } = body ?? {};
    const driver = await updateDriver(auth.member.restaurantId, params.id, { name, phone, dailyRate, perDelivery, active });
    await recordAudit(auth.member, {
      action: 'UPDATE', entityType: 'Driver', entityId: driver.id,
      changes: { name: driver.name, phone: driver.phone, dailyRateCents: driver.dailyRateCents, perDeliveryCents: driver.perDeliveryCents, active: driver.active },
    });
    return NextResponse.json({ driver });
  } catch (error) {
    return cashErrorResponse(error, 'update driver');
  }
}
