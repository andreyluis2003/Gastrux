// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) {
    return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
  }

  try {
    const owned = await prisma.alert.findFirst({ where: { id: params.id, restaurantId }, select: { id: true } });
    if (!owned) {
      return NextResponse.json({ error: 'Alerta não encontrado' }, { status: 404 });
    }

    const alert = await prisma.alert.update({
      where: { id: params.id },
      data: {
        dismissed: true,
        dismissedAt: new Date(),
      },
    });

    return NextResponse.json(alert);
  } catch (error) {
    console.error('Error dismissing alert:', error);
    return NextResponse.json(
      { error: 'Erro ao descartar alerta' },
      { status: 500 }
    );
  }
}
