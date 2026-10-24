import { NextRequest, NextResponse } from 'next/server';
import { MANAGER_ROLES, recordAudit, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** PUT /api/admin/delivery-settings { autoAccept } - "Aceitar pedidos sozinho" (owner decision 2026-10-23: on by default) */
export async function PUT(req: NextRequest) {
  const auth = await requireRestaurantRole([...MANAGER_ROLES, 'ADMIN'], 'Este ajuste é do dono ou do gerente');
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({}));
  if (typeof body?.autoAccept !== 'boolean') return NextResponse.json({ error: 'Diga se aceita os pedidos sozinho (true ou false)' }, { status: 400 });
  await prisma.restaurant.update({ where: { id: auth.member.restaurantId }, data: { deliveryAutoAccept: body.autoAccept } });
  await recordAudit(auth.member, { action: 'UPDATE', entityType: 'Restaurant', entityId: auth.member.restaurantId, changes: { deliveryAutoAccept: body.autoAccept } });
  return NextResponse.json({ autoAccept: body.autoAccept });
}
