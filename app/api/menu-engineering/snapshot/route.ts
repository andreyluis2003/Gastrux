// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function buildRecommendation(cls: string, foodCostPercent: number, margin: number): string {
  switch (cls) {
    case 'STAR':
      return 'Manter destaque no cardápio. Monitorar consistência da margem.';
    case 'HORSE':
      return foodCostPercent > 40
        ? `Food cost alto (${foodCostPercent.toFixed(1)}%). Revisar porção ou aumentar preço.`
        : 'Testar aumento suave de preço (5-8%) ou melhorar ficha técnica.';
    case 'PUZZLE':
      return `Margem ${margin.toFixed(1)}% boa, mas pouco pedido. Destacar no cardápio ou promover.`;
    case 'DOG':
      return 'Considerar remoção ou reformulação completa do prato.';
    default:
      return '';
  }
}

/**
 * POST /api/menu-engineering/snapshot
 * Cria snapshots da classificação atual (um por receita ativa).
 */
export async function POST(req: NextRequest) {
  try {
    const isInternal = req.headers.get('x-internal-trigger') === process.env.CRON_SECRET;
    if (!isInternal) {
      const session = await getServerSession(authOptions);
      if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const period = parseInt(body.period || '30');

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - period);

    const restaurant = await prisma.restaurant.findFirst({ select: { id: true } });
    const restaurantId = body.restaurantId || restaurant?.id;
    if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });

    const recipes = await prisma.recipe.findMany({
      where: { active: true, restaurantId },
      include: {
        productionPlans: true,
      },
    });

    const sessionItems = await prisma.orderSessionItem.findMany({
      where: {
        addedAt: { gte: startDate, lte: endDate },
        session: { status: { not: 'CANCELLED' as any }, restaurantId },
      },
      select: { recipeId: true, quantity: true, price: true },
    });

    const salesByRecipe: Record<string, { qty: number; revenue: number }> = {};
    for (const item of sessionItems) {
      if (!item.recipeId) continue;
      if (!salesByRecipe[item.recipeId]) salesByRecipe[item.recipeId] = { qty: 0, revenue: 0 };
      salesByRecipe[item.recipeId].qty += item.quantity;
      salesByRecipe[item.recipeId].revenue += item.quantity * Number(item.price);
    }

    const totalSalesQty = Object.values(salesByRecipe).reduce((s, r) => s + r.qty, 0);
    const hasSalesData = totalSalesQty > 0;

    const enriched = recipes.map((recipe) => {
      const sales = salesByRecipe[recipe.id] || { qty: 0, revenue: 0 };
      const qtySold = hasSalesData
        ? sales.qty
        : recipe.productionPlans.reduce((s: number, p: any) => s + p.quantity, 0);
      const sellingPrice = recipe.sellingPrice || 0;
      const revenue = sales.revenue || qtySold * sellingPrice;
      const cost = qtySold * recipe.costPerPortion;
      const contribution = sellingPrice > 0 ? (sellingPrice - recipe.costPerPortion) * qtySold : 0;
      const profitMargin = sellingPrice > 0 ? ((sellingPrice - recipe.costPerPortion) / sellingPrice) * 100 : 0;
      const foodCostPercent = sellingPrice > 0 ? (recipe.costPerPortion / sellingPrice) * 100 : 0;
      const popularity = hasSalesData && totalSalesQty > 0 ? (sales.qty / totalSalesQty) * 100 : 0;
      return { recipe, qtySold, revenue, cost, contribution, profitMargin, foodCostPercent, popularity };
    });

    const avgQty = enriched.length > 0 ? enriched.reduce((s, r) => s + r.qtySold, 0) / enriched.length : 0;
    const avgContribution = enriched.length > 0 ? enriched.reduce((s, r) => s + r.contribution, 0) / enriched.length : 0;

    const created: any[] = [];
    for (const item of enriched) {
      const isPopular = item.qtySold >= avgQty && item.qtySold > 0;
      const isProfitable = item.contribution >= avgContribution || item.profitMargin >= 60;

      let classification: 'STAR' | 'HORSE' | 'PUZZLE' | 'DOG';
      if (isPopular && isProfitable) classification = 'STAR';
      else if (isPopular && !isProfitable) classification = 'HORSE';
      else if (!isPopular && isProfitable) classification = 'PUZZLE';
      else classification = 'DOG';

      const recommendation = buildRecommendation(classification, item.foodCostPercent, item.profitMargin);

      const snap = await (prisma as any).menuEngineeringSnapshot.create({
        data: {
          recipeId: item.recipe.id,
          periodStart: startDate,
          periodEnd: endDate,
          periodDays: period,
          quantitySold: item.qtySold,
          revenue: item.revenue,
          cost: item.cost,
          contribution: item.contribution,
          profitMargin: item.profitMargin,
          popularity: item.popularity,
          classification,
          recommendation,
        },
      });
      created.push(snap);
    }

    return NextResponse.json({ success: true, count: created.length, snapshots: created });
  } catch (error: any) {
    console.error('Menu Engineering snapshot error:', error);
    return NextResponse.json({ error: 'Erro ao criar snapshots', details: error.message }, { status: 500 });
  }
}
