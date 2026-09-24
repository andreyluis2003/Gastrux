// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getRestaurantContext } from '@/lib/api/restaurant-context';
import { applyStockCount, StockCountError } from '@/lib/stock/stock-count';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const { restaurantId } = await getRestaurantContext();

    const ingredients = await prisma.ingredient.findMany({
      where: { active: true, restaurantId },
      include: {
        category: { select: { name: true, color: true } },
        currentStock: { select: { currentQuantity: true, lastUpdated: true } },
      },
      orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
    });

    const items = ingredients.map((ing) => ({
      id: ing.id,
      name: ing.name,
      code: ing.code,
      category: ing.category.name,
      categoryColor: ing.category.color,
      unit: ing.standardUnit,
      systemQuantity: ing.currentStock?.currentQuantity || 0,
      minimumStock: ing.minimumStock,
      lastUpdated: ing.currentStock?.lastUpdated,
    }));

    return NextResponse.json(items);
  } catch (error) {
    console.error('Stock count error:', error);
    return NextResponse.json({ error: 'Erro ao carregar itens' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const { restaurantId, userId } = await getRestaurantContext();

    const body = await req.json();
    // counts: Array<{ ingredientId, countedQuantity, systemQuantity (what the screen showed) }>
    // countId: one id per count screen, so saving twice applies the count once
    const { counts, countId } = body;

    if (!counts || !Array.isArray(counts)) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
    }

    const results = await applyStockCount({ restaurantId, userId, countId, counts });

    const adjusted = results.filter(r => r.adjusted).length;
    return NextResponse.json({
      message: `Contagem salva: ${adjusted} itens ajustados de ${results.length} contados`,
      results,
      adjustedCount: adjusted,
      totalCounted: results.length,
    });
  } catch (error) {
    if (error instanceof StockCountError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Stock count POST error:', error);
    return NextResponse.json({ error: 'Erro ao salvar contagem' }, { status: 500 });
  }
}
