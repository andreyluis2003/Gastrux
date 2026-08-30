// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET public menu (no auth required)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const restaurantId = searchParams.get('restaurantId');
    if (!restaurantId) {
      // Require an explicit restaurant to avoid leaking other tenants' menus
      return NextResponse.json([], { headers: { 'Cache-Control': 'public, max-age=60' } });
    }

    const categories = await prisma.menuCategory.findMany({
      where: { active: true, restaurantId },
      include: {
        items: {
          where: {
            active: true,
            displayOnQR: true,
          },
          include: {
            images: {
              where: { isPublic: true },
            },
          },
          orderBy: { position: 'asc' },
        },
      },
      orderBy: { position: 'asc' },
    });

    // Filter out categories with no items
    const filteredCategories = categories.filter(cat => cat.items.length > 0);

    return NextResponse.json(filteredCategories, {
      headers: {
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (error) {
    console.error('Error fetching public menu:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
