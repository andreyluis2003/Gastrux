// Public delivery menu endpoint - no auth required
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { restaurantId: string } }
) {
  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: params.restaurantId },
      select: {
        id: true,
        name: true,
        logoUrl: true,
        address: true,
        city: true,
        state: true,
        phone: true,
        businessHours: true,
      },
    });

    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });
    }

    const categories = await prisma.menuCategory.findMany({
      where: { active: true, restaurantId: params.restaurantId },
      include: {
        items: {
          where: { active: true, available: true, displayOnWeb: true },
          include: {
            images: { where: { isPublic: true }, take: 1 },
          },
          orderBy: { position: 'asc' },
        },
      },
      orderBy: { position: 'asc' },
    });

    const filteredCategories = categories.filter((c) => c.items.length > 0);

    return NextResponse.json(
      { restaurant, categories: filteredCategories },
      { headers: { 'Cache-Control': 'public, max-age=60' } }
    );
  } catch (error) {
    console.error('Error fetching delivery menu:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
