// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

/**
 * GET /api/menu-engineering/history
 * Retorna histórico de snapshots. Se recipeId especificado, retorna série daquela receita.
 * Caso contrário, retorna últimas migrações de classe.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const recipeId = searchParams.get('recipeId');
    const limit = parseInt(searchParams.get('limit') || '10');

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) return NextResponse.json({ snapshots: [], trends: [] });

    if (recipeId) {
      const snapshots = await (prisma as any).menuEngineeringSnapshot.findMany({
        where: { restaurantId, recipeId },
        orderBy: { periodEnd: 'desc' },
        take: limit,
      });
      return NextResponse.json({
        snapshots: snapshots.slice().reverse(),
        recipeId,
      });
    }

    // Build trends: for each recipe, compare last 2 classifications
    const all = await (prisma as any).menuEngineeringSnapshot.findMany({
      where: { restaurantId },
      orderBy: { periodEnd: 'desc' },
      include: { recipe: { select: { id: true, name: true, code: true } } },
      take: 200,
    });

    const byRecipe: Record<string, any[]> = {};
    for (const s of all) {
      if (!byRecipe[s.recipeId]) byRecipe[s.recipeId] = [];
      byRecipe[s.recipeId].push(s);
    }

    const trends = Object.values(byRecipe)
      .map((snaps: any) => {
        if (snaps.length < 2) return null;
        const latest = snaps[0];
        const previous = snaps[1];
        if (latest.classification === previous.classification) return null;
        return {
          recipeId: latest.recipeId,
          recipeName: latest.recipe?.name,
          recipeCode: latest.recipe?.code,
          from: previous.classification,
          to: latest.classification,
          marginChange: latest.profitMargin - previous.profitMargin,
          quantityChange: latest.quantitySold - previous.quantitySold,
          changedAt: latest.periodEnd,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ trends, totalSnapshots: all.length });
  } catch (error: any) {
    console.error('Menu Eng history error:', error);
    return NextResponse.json({ error: 'Erro ao buscar histórico' }, { status: 500 });
  }
}
