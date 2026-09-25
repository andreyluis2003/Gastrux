import { NextResponse } from 'next/server';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { buildKitchenTicket } from '@/lib/print/tickets';

export const dynamic = 'force-dynamic';

/** GET /api/print/kitchen/[orderId] - the kitchen ticket of one order of THIS restaurant. */
export async function GET(_request: Request, { params }: { params: { orderId: string } }) {
  const auth = await requireRestaurantRole(['OWNER', 'MANAGER', 'CASHIER', 'COOK', 'ADMIN']);
  if (!auth.ok) return auth.response;
  const ticket = await buildKitchenTicket(auth.member.restaurantId, params.orderId);
  if (!ticket) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
  return NextResponse.json(ticket);
}
