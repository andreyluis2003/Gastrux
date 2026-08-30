// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }


    const { sellingPrice } = await req.json();

    const recipe = await prisma.recipe.update({
      where: { id: params.id },
        restaurantId,
    });

    return NextResponse.json(recipe);
  } catch (error) {
    console.error('Selling price error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar preço' }, { status: 500 });
  }
}
