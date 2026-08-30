// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function buildRecommendation(cls: string, foodCostPercent: number, margin: number): string {
  switch (cls) {
    case 'STAR':
      return 'Manter destaque no cardápio. Monitorar consistência da margem. Considerar combos que potencializem pedidos adicionais.';
    case 'HORSE':
      return foodCostPercent > 40
        ? `Food cost alto (${foodCostPercent.toFixed(1)}%). Reavaliar porção, substituir ingredientes caros ou aumentar preço 5-10%.`
        : 'Prato popular com margem baixa. Testar aumento suave de preço (5-8%) ou redesenhar ficha técnica para melhorar margem.';
    case 'PUZZLE':
      return `Boa margem (${margin.toFixed(1)}%), mas pouco pedido. Destacar no cardápio, criar promoção cruzada com STARs ou reposicionar como sugestão do chef.`;
    case 'DOG':
      return 'Baixa popularidade e baixa margem. Considerar remoção do cardápio, reformulação completa ou substituição por item de maior potencial.';
    default:
      return 'Sem recomendação.';
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const period = parseInt(searchParams.get('period') || '30');
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - period);

    const restaurant = await prisma.restaurant.findFirst({ select: { id: true } });
    const restaurantId = restaurant?.id;

    // Get all active recipes
    const recipes = await prisma.recipe.findMany({
      where: { active: true, ...(restaurantId ? { restaurantId } : {}) },
      include: {
        productionPlans: { include: { plan: { select: { planDate: true } } } },
      },
    });

    // SALES DATA: OrderSessionItem from sessions not CANCELLED in period
    const sessionItems = await prisma.orderSessionItem.findMany({
      where: {
        addedAt: { gte: startDate },
        session: {
          status: { not: 'CANCELLED' as any },
          ...(restaurantId ? { restaurantId } : {}),
        },
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

    // Calculate averages for quadrant split
    const avgCost = recipes.length > 0 ? recipes.reduce((s, r) => s + r.costPerPortion, 0) / recipes.length : 0;

    const enriched = recipes.map((recipe) => {
      const sales = salesByRecipe[recipe.id] || { qty: 0, revenue: 0 };

      // Popularity: based on sales qty; fallback to production count when no sales
      const qtySold = hasSalesData
        ? sales.qty
        : recipe.productionPlans.reduce((s, p) => s + p.quantity, 0);
      const popularityPercent = hasSalesData && totalSalesQty > 0
        ? (sales.qty / totalSalesQty) * 100
        : 0;

      const sellingPrice = recipe.sellingPrice || 0;
      const revenue = sales.revenue || qtySold * sellingPrice;
      const cost = qtySold * recipe.costPerPortion;
      const contribution = sellingPrice > 0 ? (sellingPrice - recipe.costPerPortion) * qtySold : 0;
      const profitMargin = sellingPrice > 0 ? ((sellingPrice - recipe.costPerPortion) / sellingPrice) * 100 : 0;
      const foodCostPercent = sellingPrice > 0 ? (recipe.costPerPortion / sellingPrice) * 100 : 0;

      return {
        id: recipe.id,
        name: recipe.name,
        code: recipe.code,
        costPerPortion: recipe.costPerPortion,
        sellingPrice,
        qtySold,
        revenue,
        cost,
        contribution,
        profitMargin,
        foodCostPercent,
        popularityPercent,
        totalProduced: recipe.productionPlans.reduce((s, p) => s + p.quantity, 0),
      };
    });

    // Averages for quadrant thresholds
    const avgQty = enriched.length > 0 ? enriched.reduce((s, r) => s + r.qtySold, 0) / enriched.length : 0;
    const avgContribution = enriched.length > 0 ? enriched.reduce((s, r) => s + r.contribution, 0) / enriched.length : 0;

    const classified = enriched.map((r) => {
      const isPopular = r.qtySold >= avgQty && r.qtySold > 0;
      const isProfitable = r.contribution >= avgContribution || r.profitMargin >= 60;

      let classification: 'STAR' | 'HORSE' | 'PUZZLE' | 'DOG';
      if (isPopular && isProfitable) classification = 'STAR';
      else if (isPopular && !isProfitable) classification = 'HORSE';
      else if (!isPopular && isProfitable) classification = 'PUZZLE';
      else classification = 'DOG';

      return {
        ...r,
        classification,
        recommendation: buildRecommendation(classification, r.foodCostPercent, r.profitMargin),
      };
    });

    const summary = {
      stars: classified.filter(r => r.classification === 'STAR').length,
      horses: classified.filter(r => r.classification === 'HORSE').length,
      puzzles: classified.filter(r => r.classification === 'PUZZLE').length,
      dogs: classified.filter(r => r.classification === 'DOG').length,
      total: classified.length,
    };

    return NextResponse.json({
      recipes: classified,
      summary,
      averages: { avgCost, avgQty, avgContribution },
      dataSource: hasSalesData ? 'SALES' : 'PRODUCTION',
      period,
    });
  } catch (error) {
    console.error('Menu Engineering error:', error);
    return NextResponse.json({ error: 'Erro na engenharia de cardápio' }, { status: 500 });
  }
}
