// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId, requireAdminSession } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });

  const call = await prisma.voiceCall.findFirst({
    where: { id: params.id, restaurantId },
    include: {
      reservation: {
        select: { id: true, guestName: true, partySize: true, reservedAt: true, status: true, guestPhone: true },
      },
    },
  });

  if (!call) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  return NextResponse.json({ call });
}
