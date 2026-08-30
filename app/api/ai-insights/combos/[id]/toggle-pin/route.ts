// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
    const insight = await prisma.aIInsight.findFirst({ where: { id: params.id, restaurantId } });
    if (!insight) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

    await prisma.aIInsight.update({
      where: { id: params.id },
      data: { pinned: !insight.pinned },
    });

    return NextResponse.json({ success: true, pinned: !insight.pinned });
  } catch (error: any) {
    console.error('[toggle-pin]', error);
    return NextResponse.json({ error: 'Erro' }, { status: 500 });
  }
}
