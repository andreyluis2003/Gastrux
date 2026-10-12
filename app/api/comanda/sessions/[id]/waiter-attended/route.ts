import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { recordAudit, requireRestaurantRole } from '@/lib/auth/restaurant-role';

export const dynamic = 'force-dynamic';

/**
 * POST: "Atendido" (owner, 2026-10-12). A table asked to pay with the waiter (pay at the table) and the staff
 * went there without taking a payment (the customer changed their mind, paid in another way later): the
 * call is dismissed and the table leaves the highlight on the map. Any staff member; no money moves.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(['OWNER', 'MANAGER', 'CASHIER', 'COOK', 'ADMIN']);
  if (!auth.ok) return auth.response;
  const { member } = auth;

  const owned = await prisma.orderSession.findFirst({ where: { id: params.id, restaurantId: member.restaurantId }, select: { id: true } });
  if (!owned) return NextResponse.json({ error: 'Comanda não encontrada' }, { status: 404 });

  const cleared = await prisma.orderSession.updateMany({
    where: { id: owned.id, restaurantId: member.restaurantId, payAtWaiterRequestedAt: { not: null } },
    data: { payAtWaiterRequestedAt: null },
  });
  if (cleared.count === 0) return NextResponse.json({ attended: false });

  await recordAudit(member, { action: 'UPDATE', entityType: 'OrderSession', entityId: owned.id, changes: { waiterCall: 'attended' } });
  return NextResponse.json({ attended: true });
}
