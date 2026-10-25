// @ts-nocheck
import { prisma } from '@/lib/prisma';
import { lineTotal } from '@/lib/comanda/line-total';
import { OWN_RECIPE_WHERE } from '@/lib/cardapio/product-recipe';
import { withLiveCost } from '@/lib/recipes/cost-map';

const pct = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;

export function buildRecommendation(cls: string, foodCostPercent: number, margin: number): string {
  switch (cls) {
    case 'STAR':
      return 'Manter destaque no cardápio. Monitorar consistência da margem. Considerar combos que potencializem pedidos adicionais.';
    case 'HORSE':
      return foodCostPercent > 40
        ? `Food cost alto (${pct(foodCostPercent)}). Reavaliar porção, substituir ingredientes caros ou aumentar preço 5-10%.`
        : 'Prato popular com margem baixa. Testar aumento suave de preço (5-8%) ou redesenhar ficha técnica para melhorar margem.';
    case 'PUZZLE':
      return `Boa margem (${pct(margin)}), mas pouco pedido. Destacar no cardápio, criar promoção junto com as Estrelas ou reposicionar como sugestão do chef.`;
    case 'DOG':
      return 'Baixa popularidade e baixa margem. Considerar remoção do cardápio, reformulação completa ou substituição por item de maior potencial.';
    default:
      return 'Sem recomendação.';
  }
}

/**
 * Engenharia de cardápio of the last `period` days: the screen (app/api/menu-engineering) and the executive
 * report (lib/reports/executive.ts) use the same numbers (moved out of the route 2026-10-23).
 */
export async function analyzeMenu(restaurantId: string, period: number) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - period);
  // The restaurant's fichas técnicas. Fichas simples (items sold without one) have no cost: a soda showed
  // a 100% margin and pulled the averages, so they are left out and named for the screen (2026-10-12)
  const recipes = await prisma.recipe.findMany({
    where: { active: true, restaurantId, ...OWN_RECIPE_WHERE },
    include: {
      productionPlans: { include: { plan: { select: { planDate: true } } } },
    },
  });
  const withoutFicha = (
    await prisma.recipe.findMany({
      where: { active: true, restaurantId, code: { startsWith: 'PROD-' }, ingredients: { none: {} } },
      select: { name: true },
      orderBy: { name: 'asc' },
    })
  ).map((r) => r.name);
  const analysed = new Set(recipes.map((r) => r.id));
  // The cost of each ficha now, from its insumos (the stored costPerPortion was never written, 2026-10-19)
  await withLiveCost(restaurantId, recipes);

  // SALES DATA: OrderSessionItem from sessions not CANCELLED in period
  const sessionItems = await prisma.orderSessionItem.findMany({
    where: {
      addedAt: { gte: startDate },
      session: {
        status: { not: 'CANCELLED' as any },
        restaurantId,
      },
    },
    select: { recipeId: true, quantity: true, price: true, modifiers: { select: { priceAdjustment: true } } },
  });

  const salesByRecipe: Record<string, { qty: number; revenue: number }> = {};
  for (const item of sessionItems) {
    if (!item.recipeId || !analysed.has(item.recipeId)) continue;
    if (!salesByRecipe[item.recipeId]) salesByRecipe[item.recipeId] = { qty: 0, revenue: 0 };
    salesByRecipe[item.recipeId].qty += item.quantity;
    // Modifier surcharges are revenue too, applied to each unit (lib/comanda/line-total.ts).
    salesByRecipe[item.recipeId].revenue += lineTotal(item.price, item.quantity, item.modifiers.map((m) => m.priceAdjustment));
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

  return {
    recipes: classified,
    summary,
    averages: { avgCost, avgQty, avgContribution },
    withoutFicha,
    dataSource: hasSalesData ? 'SALES' : 'PRODUCTION',
    period,
  };
}
