// FASE 50+Sprint2: Public menu endpoint - fetched via QR code
// No authentication required - customers scan QR to view menu
// Sprint 2: includes menu engineering badges (Star/Puzzle highlights)
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/public/menu/[qrToken] - Returns restaurant info, table info, and full menu
export async function GET(
  req: NextRequest,
  { params }: { params: { qrToken: string } }
) {
  try {
    const qrToken = params.qrToken;
    if (!qrToken || qrToken.length < 16) {
      return NextResponse.json({ error: 'Invalid QR token' }, { status: 400 });
    }

    // Find the table by QR token
    const table = (await prisma.table.findUnique({
      where: { qrToken },
      include: {
        section: { select: { id: true, name: true } },
        restaurant: { select: { id: true, name: true } },
      },
    })) as any;

    if (!table) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    }

    // Fetch menu categories + active items for QR display (scoped to this restaurant)
    const categories = await prisma.menuCategory.findMany({
      where: { active: true, restaurantId: table.restaurant.id },
      include: {
        items: {
          where: { active: true, available: true, displayOnQR: true },
          include: {
            images: { where: { isPublic: true }, take: 1 },
          },
          orderBy: { position: 'asc' },
        },
      },
      orderBy: { position: 'asc' },
    });

    // Sprint 2: Fetch menu engineering classifications for recipe-linked items
    const recipeIds = categories
      .flatMap((c: any) => c.items)
      .filter((i: any) => i.recipeId)
      .map((i: any) => i.recipeId);

    let classificationMap: Record<string, string> = {};
    if (recipeIds.length > 0) {
      try {
        // Get latest snapshot per recipe
        const snapshots = await (prisma as any).menuEngineeringSnapshot.findMany({
          where: {
            restaurantId: table.restaurant.id,
            recipeId: { in: recipeIds },
          },
          orderBy: { periodEnd: 'desc' },
          select: { recipeId: true, classification: true },
        });
        // Keep only the latest per recipe
        for (const snap of snapshots) {
          if (!classificationMap[snap.recipeId]) {
            classificationMap[snap.recipeId] = snap.classification;
          }
        }
      } catch (e) {
        console.error('[public-menu] Error fetching classifications:', e);
      }
    }

    // Enrich items with badges
    const enrichedCategories = categories
      .map((cat: any) => ({
        ...cat,
        items: cat.items.map((item: any) => {
          const cls = item.recipeId ? classificationMap[item.recipeId] : null;
          let badge = null;
          if (cls === 'STAR') badge = { type: 'popular', label: 'Mais Pedido', emoji: '🔥' };
          else if (cls === 'PUZZLE') badge = { type: 'chef', label: 'Sugestão do Chef', emoji: '👨‍🍳' };
          return { ...item, badge };
        }),
      }))
      .filter((c: any) => c.items.length > 0);

    // Sprint 2: Fetch active combos for this restaurant
    let combos: any[] = [];
    try {
      const comboInsights = await prisma.aIInsight.findMany({
        where: {
          restaurantId: table.restaurant.id,
          type: 'COMBO_SUGGESTION' as any,
          pinned: true,
          dismissed: false,
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          title: true,
          summary: true,
          content: true,
          dataSnapshot: true,
        },
      });
      combos = comboInsights.map((c: any) => ({
        id: c.id,
        name: c.title,
        description: c.summary,
        items: c.dataSnapshot?.items || [],
        discountPercent: c.dataSnapshot?.discountPercent || 0,
        comboPrice: c.dataSnapshot?.comboPrice || 0,
      }));
    } catch (e) {
      // COMBO_SUGGESTION may not exist yet - silent fail
    }

    return NextResponse.json({
      table: {
        id: table.id,
        number: table.number,
        section: table.section,
        qrToken: table.qrToken,
      },
      restaurant: table.restaurant,
      categories: enrichedCategories,
      combos,
    }, {
      headers: { 'Cache-Control': 'public, max-age=60' },
    });
  } catch (error) {
    console.error('Error fetching public menu:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
