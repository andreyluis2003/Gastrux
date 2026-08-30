// Feature #8: Upsell inteligente — sugestões de itens complementares
// GET /api/upsell/suggestions?menuItemId=xxx
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const menuItemId = searchParams.get('menuItemId');
    const restaurantId = searchParams.get('restaurantId');
    const limit = parseInt(searchParams.get('limit') || '3');

    if (!menuItemId) {
      return NextResponse.json({ error: 'menuItemId obrigat\u00f3rio' }, { status: 400 });
    }

    // Get the current menu item + its category
    const currentItem = await prisma.menuItem.findUnique({
      where: { id: menuItemId },
      include: { category: true },
    });
    if (!currentItem) {
      return NextResponse.json({ suggestions: [] });
    }

    // Strategy 1: Frequently ordered together (from order history)
    const frequentPairs = await prisma.$queryRaw`
      SELECT oi2."recipeId", COUNT(*) as pair_count
      FROM order_items oi1
      JOIN order_items oi2 ON oi1."orderId" = oi2."orderId"
      JOIN menu_items mi1 ON mi1."recipeId" = oi1."recipeId"
      JOIN menu_items mi2 ON mi2."recipeId" = oi2."recipeId"
      WHERE mi1.id = ${menuItemId}
        AND mi2.id != ${menuItemId}
        AND mi2.active = true
        AND mi2.available = true
      GROUP BY oi2."recipeId"
      ORDER BY pair_count DESC
      LIMIT ${limit + 2}
    ` as any[];

    const pairedRecipeIds = frequentPairs.map((p: any) => p.recipeId).filter(Boolean);

    // Strategy 2: Complementary categories (different category, lower price - side dishes / drinks)
    const complementaryItems = await prisma.menuItem.findMany({
      where: {
        id: { not: menuItemId },
        categoryId: { not: currentItem.categoryId },
        restaurantId: currentItem.restaurantId,
        active: true,
        available: true,
        price: { lte: currentItem.price },
      },
      include: { category: true, images: { take: 1, where: { isPublic: true } } },
      orderBy: [{ position: 'asc' }],
      take: limit + 2,
    });

    // Strategy 3: Same category popular items (different item, for upgrade upsell)
    const sameCategoryItems = await prisma.menuItem.findMany({
      where: {
        id: { not: menuItemId },
        categoryId: currentItem.categoryId,
        restaurantId: currentItem.restaurantId,
        active: true,
        available: true,
        price: { gt: currentItem.price },
      },
      include: { category: true, images: { take: 1, where: { isPublic: true } } },
      orderBy: { price: 'asc' },
      take: 2,
    });

    // Merge and deduplicate
    const seenIds = new Set<string>();
    const suggestions: any[] = [];

    // First: paired items from order history
    if (pairedRecipeIds.length > 0) {
      const pairedMenuItems = await prisma.menuItem.findMany({
        where: { recipeId: { in: pairedRecipeIds }, restaurantId: currentItem.restaurantId, active: true, available: true },
        include: { category: true, images: { take: 1, where: { isPublic: true } } },
      });
      for (const item of pairedMenuItems) {
        if (!seenIds.has(item.id) && item.id !== menuItemId) {
          seenIds.add(item.id);
          suggestions.push({
            id: item.id,
            name: item.name,
            description: item.description,
            price: Number(item.price),
            category: item.category.name,
            image: item.images[0]?.imageUrl || null,
            reason: 'Frequentemente pedido junto',
            type: 'paired',
          });
        }
      }
    }

    // Then: complementary items
    for (const item of complementaryItems) {
      if (suggestions.length >= limit) break;
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        suggestions.push({
          id: item.id,
          name: item.name,
          description: item.description,
          price: Number(item.price),
          category: item.category.name,
          image: item.images[0]?.imageUrl || null,
          reason: `Combina bem \u2022 ${item.category.name}`,
          type: 'complementary',
        });
      }
    }

    // Finally: upgrade upsell
    for (const item of sameCategoryItems) {
      if (suggestions.length >= limit) break;
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        suggestions.push({
          id: item.id,
          name: item.name,
          description: item.description,
          price: Number(item.price),
          category: item.category.name,
          image: item.images[0]?.imageUrl || null,
          reason: 'Experimente tamb\u00e9m',
          type: 'upgrade',
        });
      }
    }

    return NextResponse.json({ suggestions: suggestions.slice(0, limit) }, { headers: { 'Cache-Control': 'public, max-age=300' } });
  } catch (error) {
    console.error('Error fetching upsell suggestions:', error);
    return NextResponse.json({ suggestions: [] });
  }
}
