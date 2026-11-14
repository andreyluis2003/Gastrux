import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { parseDeliveryFee } from '@/lib/delivery/fee';

export const dynamic = 'force-dynamic';

// Taxa de entrega of the delivery link (owner request 2026-11-14): 0 = free delivery.
// The restaurant always comes from the session (the member's current restaurant).

async function authorize() {
  return requireRestaurantRole(MANAGER_ROLES, 'Apenas o dono, administrador ou gerente pode alterar a taxa de entrega');
}

export async function GET() {
  const auth = await authorize();
  if (!auth.ok) return auth.response;
  const r = await prisma.restaurant.findUnique({ where: { id: auth.member.restaurantId }, select: { deliveryFee: true } });
  return NextResponse.json({ deliveryFee: r?.deliveryFee ?? 0 });
}

export async function PUT(request: NextRequest) {
  const auth = await authorize();
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null);
  const parsed = parseDeliveryFee(body?.deliveryFee);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const r = await prisma.restaurant.update({ where: { id: auth.member.restaurantId }, data: { deliveryFee: parsed.fee }, select: { deliveryFee: true } });
  return NextResponse.json({ deliveryFee: r.deliveryFee });
}
