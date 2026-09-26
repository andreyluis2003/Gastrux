import { NextResponse } from 'next/server';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { buildReceipt } from '@/lib/print/tickets';

export const dynamic = 'force-dynamic';

/** GET /api/print/receipt/[sessionId] - the customer receipt (with its NFC-e) of a comanda of THIS restaurant. */
export async function GET(_request: Request, { params }: { params: { sessionId: string } }) {
  const auth = await requireRestaurantRole(['OWNER', 'MANAGER', 'CASHIER', 'ADMIN']);
  if (!auth.ok) return auth.response;
  const receipt = await buildReceipt(auth.member.restaurantId, params.sessionId);
  if (!receipt) return NextResponse.json({ error: 'Comanda não encontrada' }, { status: 404 });
  return NextResponse.json(receipt);
}
