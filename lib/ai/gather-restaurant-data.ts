// @ts-nocheck
import { prisma } from '@/lib/prisma';

export interface RestaurantDailySummary {
  date: string;
  revenue: number;
  orderCount: number;
  avgTicket: number;
  cmvPercent: number | null;
  topSellingItems: Array<{ name: string; qty: number; revenue: number }>;
  leastProfitableItem: { name: string; margin: number; cost: number; price: number } | null;
  mostProfitableItem: { name: string; margin: number; cost: number; price: number } | null;
  lowStockIngredients: Array<{ name: string; current: number; minimum: number; unit: string }>;
  priceAlerts: Array<{ ingredient: string; changePercent: number }>;
  restaurantName: string;
}

export async function gatherDailySummary(restaurantId: string): Promise<RestaurantDailySummary> {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  // Yesterday if called late at night
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  const yesterdayEnd = new Date(yesterday);
  yesterdayEnd.setHours(23, 59, 59, 999);

  // Use yesterday's data if called after 20:00 or today has no data
  let queryStart = startOfDay;
  let queryEnd = endOfDay;

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { name: true },
  });

  // Get order session items for the day
  const sessionItems = await prisma.orderSessionItem.findMany({
    where: {
      addedAt: { gte: queryStart, lte: queryEnd },
      session: { restaurantId, status: { not: 'CANCELLED' as any } },
    },
    include: {
      recipe: { select: { name: true, sellingPrice: true, costPerPortion: true } },
    },
  });

  // If no data today, try yesterday
  if (sessionItems.length === 0) {
    queryStart = yesterday;
    queryEnd = yesterdayEnd;
    const yesterdayItems = await prisma.orderSessionItem.findMany({
      where: {
        addedAt: { gte: queryStart, lte: queryEnd },
        session: { restaurantId, status: { not: 'CANCELLED' as any } },
      },
      include: {
        recipe: { select: { name: true, sellingPrice: true, costPerPortion: true } },
      },
    });
    sessionItems.push(...yesterdayItems);
  }

  // Aggregate sales
  const itemAgg: Record<string, { name: string; qty: number; revenue: number; cost: number; price: number }> = {};
  let totalRevenue = 0;
  let totalCost = 0;

  for (const item of sessionItems) {
    const name = item.recipe?.name || 'Item';
    const price = Number(item.recipe?.sellingPrice || item.price || 0);
    const cost = Number(item.recipe?.costPerPortion || 0);
    const qty = item.quantity || 1;

    if (!itemAgg[name]) itemAgg[name] = { name, qty: 0, revenue: 0, cost, price };
    itemAgg[name].qty += qty;
    itemAgg[name].revenue += price * qty;
    totalRevenue += price * qty;
    totalCost += cost * qty;
  }

  const items = Object.values(itemAgg).sort((a, b) => b.qty - a.qty);
  const topSellingItems = items.slice(0, 5).map(i => ({ name: i.name, qty: i.qty, revenue: Math.round(i.revenue * 100) / 100 }));

  // Margins
  const withMargin = items.map(i => ({
    name: i.name,
    margin: i.price > 0 ? ((i.price - i.cost) / i.price) * 100 : 0,
    cost: i.cost,
    price: i.price,
  })).filter(i => i.price > 0);

  withMargin.sort((a, b) => a.margin - b.margin);
  const leastProfitableItem = withMargin.length > 0 ? withMargin[0] : null;
  const mostProfitableItem = withMargin.length > 0 ? withMargin[withMargin.length - 1] : null;

  // Order count (unique sessions)
  const sessionIds = new Set(sessionItems.map(i => (i as any).sessionId || (i as any).orderSessionId));
  const orderCount = sessionIds.size || Math.ceil(sessionItems.length / 2);
  const avgTicket = orderCount > 0 ? totalRevenue / orderCount : 0;
  const cmvPercent = totalRevenue > 0 ? (totalCost / totalRevenue) * 100 : null;

  // Low stock
  const lowStockIngredients = await prisma.$queryRaw<any[]>`
    SELECT i.name, s."currentQuantity" as current, i."minimumStock" as minimum, i."standardUnit" as unit
    FROM ingredients i
    LEFT JOIN stocks s ON s."ingredientId" = i.id
    WHERE i."restaurantId" = ${restaurantId}
      AND i.active = true
      AND i."minimumStock" > 0
      AND COALESCE(s."currentQuantity", 0) < i."minimumStock"
    LIMIT 5
  `.catch(() => []);

  // Price alerts — ingredients whose cost changed significantly in last 7 days
  const priceAlerts: Array<{ ingredient: string; changePercent: number }> = [];
  try {
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentEntries = await prisma.stockMovement.findMany({
      where: {
        ingredient: { restaurantId },
        movementType: 'ENTRY',
        createdAt: { gte: sevenDaysAgo },
      },
      include: { ingredient: { select: { name: true, referenceCost: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    // Compare with reference cost
    const seen = new Set<string>();
    for (const entry of recentEntries) {
      if (!entry.ingredient || seen.has(entry.ingredient.name)) continue;
      seen.add(entry.ingredient.name);
      const refCost = Number(entry.ingredient.referenceCost || 0);
      if (refCost > 0 && entry.quantity > 0) {
        // Estimate unit cost from entry if possible
        const entryCost = Number((entry as any).unitCost || refCost);
        const change = ((entryCost - refCost) / refCost) * 100;
        if (Math.abs(change) >= 15) {
          priceAlerts.push({ ingredient: entry.ingredient.name, changePercent: Math.round(change) });
        }
      }
    }
  } catch {}

  return {
    date: queryStart.toISOString().split('T')[0],
    revenue: Math.round(totalRevenue * 100) / 100,
    orderCount,
    avgTicket: Math.round(avgTicket * 100) / 100,
    cmvPercent: cmvPercent !== null ? Math.round(cmvPercent * 10) / 10 : null,
    topSellingItems,
    leastProfitableItem: leastProfitableItem ? {
      name: leastProfitableItem.name,
      margin: Math.round(leastProfitableItem.margin * 10) / 10,
      cost: Math.round(leastProfitableItem.cost * 100) / 100,
      price: Math.round(leastProfitableItem.price * 100) / 100,
    } : null,
    mostProfitableItem: mostProfitableItem ? {
      name: mostProfitableItem.name,
      margin: Math.round(mostProfitableItem.margin * 10) / 10,
      cost: Math.round(mostProfitableItem.cost * 100) / 100,
      price: Math.round(mostProfitableItem.price * 100) / 100,
    } : null,
    lowStockIngredients: lowStockIngredients.map((i: any) => ({
      name: i.name,
      current: Number(i.current || 0),
      minimum: Number(i.minimum || 0),
      unit: i.unit || 'un',
    })),
    priceAlerts,
    restaurantName: restaurant?.name || 'Restaurante',
  };
}

export interface AnomalyDetectionResult {
  anomalies: Array<{
    type: 'cmv_spike' | 'cmv_drop' | 'revenue_spike' | 'revenue_drop' | 'classification_change' | 'price_alert' | 'stock_critical';
    severity: 'info' | 'warning' | 'critical';
    title: string;
    message: string;
    data?: any;
  }>;
}

export async function detectAnomalies(restaurantId: string): Promise<AnomalyDetectionResult> {
  const anomalies: AnomalyDetectionResult['anomalies'] = [];

  // 1. CMV spike detection — compare last 2 snapshots
  const cmvSnapshots = await prisma.cMVSnapshot.findMany({
    where: { restaurantId },
    orderBy: { periodEnd: 'desc' },
    take: 2,
  });

  if (cmvSnapshots.length === 2) {
    const latest = cmvSnapshots[0];
    const previous = cmvSnapshots[1];
    const latestPct = Number(latest.cmvPercent || 0);
    const previousPct = Number(previous.cmvPercent || 0);
    const delta = latestPct - previousPct;

    if (delta >= 3) {
      anomalies.push({
        type: 'cmv_spike',
        severity: latestPct > 40 ? 'critical' : 'warning',
        title: `CMV subiu ${delta.toFixed(1)}pp`,
        message: `Seu CMV foi de ${previousPct.toFixed(1)}% para ${latestPct.toFixed(1)}% no último período. ${latestPct > 40 ? 'ATENÇÃO: acima de 40% é crítico!' : 'Investigue quais ingredientes encareceram.'}`,
        data: { latest: latestPct, previous: previousPct, delta },
      });
    }

    if (delta <= -5 && latestPct < 20 && Number(latest.revenue || 0) > 0) {
      anomalies.push({
        type: 'cmv_drop',
        severity: 'info',
        title: `CMV caiu ${Math.abs(delta).toFixed(1)}pp`,
        message: `Seu CMV baixou para ${latestPct.toFixed(1)}%. Ótimo resultado! Continue monitorando para garantir que a qualidade se mantém.`,
        data: { latest: latestPct, previous: previousPct },
      });
    }
  }

  // 2. Menu engineering classification changes
  const menuSnapshots = await prisma.menuEngineeringSnapshot.findMany({
    where: { restaurantId },
    orderBy: { periodEnd: 'desc' },
    take: 200,
    select: { recipeId: true, classification: true, periodEnd: true, recipe: { select: { name: true } } },
  });

  // Group by recipe, find latest 2 snapshots per recipe
  const byRecipe: Record<string, any[]> = {};
  for (const s of menuSnapshots) {
    if (!byRecipe[s.recipeId]) byRecipe[s.recipeId] = [];
    if (byRecipe[s.recipeId].length < 2) byRecipe[s.recipeId].push(s);
  }

  for (const [recipeId, snaps] of Object.entries(byRecipe)) {
    if (snaps.length === 2 && snaps[0].classification !== snaps[1].classification) {
      const from = snaps[1].classification;
      const to = snaps[0].classification;
      const name = snaps[0].recipe?.name || 'Prato';

      if (to === 'DOG' && from !== 'DOG') {
        anomalies.push({
          type: 'classification_change',
          severity: 'warning',
          title: `${name} virou Dog 🐕`,
          message: `O prato "${name}" passou de ${from} para DOG (baixa popularidade + baixa margem). Considere remover do cardápio ou reformular.`,
          data: { recipe: name, from, to },
        });
      } else if (to === 'STAR' && from !== 'STAR') {
        anomalies.push({
          type: 'classification_change',
          severity: 'info',
          title: `${name} virou Star ⭐`,
          message: `Ótima notícia! "${name}" subiu para STAR. Mantenha o destaque no cardápio.`,
          data: { recipe: name, from, to },
        });
      }
    }
  }

  // 3. Low stock critical
  const criticalStock = await prisma.$queryRaw<any[]>`
    SELECT i.name, s."currentQuantity" as current, i."minimumStock" as minimum, i."standardUnit" as unit
    FROM ingredients i
    LEFT JOIN stocks s ON s."ingredientId" = i.id
    WHERE i."restaurantId" = ${restaurantId}
      AND i.active = true
      AND i."minimumStock" > 0
      AND COALESCE(s."currentQuantity", 0) <= i."minimumStock" * 0.3
    LIMIT 5
  `.catch(() => []);

  if (criticalStock.length > 0) {
    anomalies.push({
      type: 'stock_critical',
      severity: 'critical',
      title: `${criticalStock.length} insumo(s) em nível crítico`,
      message: `Estoque crítico: ${criticalStock.map((i: any) => i.name).join(', ')}. Faça pedido de compra urgente.`,
      data: { items: criticalStock },
    });
  }

  // 4. Revenue comparison (last 7 vs previous 7 days)
  const now = new Date();
  const sevenAgo = new Date(now);
  sevenAgo.setDate(sevenAgo.getDate() - 7);
  const fourteenAgo = new Date(now);
  fourteenAgo.setDate(fourteenAgo.getDate() - 14);

  try {
    const [current7d, previous7d] = await Promise.all([
      prisma.orderSessionItem.aggregate({
        where: {
          addedAt: { gte: sevenAgo },
          session: { restaurantId, status: { not: 'CANCELLED' as any } },
        },
        _sum: { price: true },
      }),
      prisma.orderSessionItem.aggregate({
        where: {
          addedAt: { gte: fourteenAgo, lt: sevenAgo },
          session: { restaurantId, status: { not: 'CANCELLED' as any } },
        },
        _sum: { price: true },
      }),
    ]);

    const currRev = Number(current7d._sum?.price || 0);
    const prevRev = Number(previous7d._sum?.price || 0);

    if (prevRev > 0) {
      const change = ((currRev - prevRev) / prevRev) * 100;
      if (change >= 15) {
        anomalies.push({
          type: 'revenue_spike',
          severity: 'info',
          title: `Faturamento subiu ${change.toFixed(0)}% 📈`,
          message: `Nos últimos 7 dias o faturamento foi ${change.toFixed(0)}% acima da semana anterior. Parabéns!`,
          data: { current: currRev, previous: prevRev, change },
        });
      } else if (change <= -15) {
        anomalies.push({
          type: 'revenue_drop',
          severity: 'warning',
          title: `Faturamento caiu ${Math.abs(change).toFixed(0)}% 📉`,
          message: `Nos últimos 7 dias o faturamento caiu ${Math.abs(change).toFixed(0)}% comparado à semana anterior. Analise o que mudou.`,
          data: { current: currRev, previous: prevRev, change },
        });
      }
    }
  } catch {}

  return { anomalies };
}

export async function gatherChatContext(restaurantId: string): Promise<string> {
  const now = new Date();
  const thirtyAgo = new Date(now);
  thirtyAgo.setDate(thirtyAgo.getDate() - 30);
  const sevenAgo = new Date(now);
  sevenAgo.setDate(sevenAgo.getDate() - 7);

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { name: true },
  });

  // Parallel data gathering
  const [recipes, ingredients, sessions30d, sessions7d, latestCMV, latestMenuEng] = await Promise.all([
    prisma.recipe.findMany({
      where: { restaurantId, active: true },
      select: { name: true, sellingPrice: true, costPerPortion: true },
      take: 30,
    }),
    prisma.ingredient.findMany({
      where: { restaurantId, active: true },
      include: { currentStock: true },
      take: 50,
    }),
    prisma.orderSessionItem.aggregate({
      where: {
        addedAt: { gte: thirtyAgo },
        session: { restaurantId, status: { not: 'CANCELLED' as any } },
      },
      _sum: { price: true },
      _count: true,
    }),
    prisma.orderSessionItem.aggregate({
      where: {
        addedAt: { gte: sevenAgo },
        session: { restaurantId, status: { not: 'CANCELLED' as any } },
      },
      _sum: { price: true },
      _count: true,
    }),
    prisma.cMVSnapshot.findFirst({
      where: { restaurantId },
      orderBy: { periodEnd: 'desc' },
    }),
    prisma.menuEngineeringSnapshot.findMany({
      where: { restaurantId },
      orderBy: { periodEnd: 'desc' },
      take: 30,
      select: { classification: true, recipe: { select: { name: true } }, revenue: true, contribution: true },
    }),
  ]);

  const recipeSummary = recipes.map(r => {
    const price = Number(r.sellingPrice || 0);
    const cost = Number(r.costPerPortion || 0);
    const margin = price > 0 ? ((price - cost) / price * 100).toFixed(1) : 'N/A';
    return `- ${r.name}: preço R$${price.toFixed(2)}, custo R$${cost.toFixed(2)}, margem ${margin}%`;
  }).join('\n');

  const lowStock = ingredients.filter((i: any) => {
    const current = Number(i.currentStock?.currentQuantity || 0);
    const min = Number(i.minimumStock || 0);
    return min > 0 && current < min;
  }).map((i: any) => `- ${i.name}: ${Number(i.currentStock?.currentQuantity || 0)} ${i.standardUnit} (mínimo: ${i.minimumStock})`);

  const menuClasses = { STAR: [] as string[], HORSE: [] as string[], PUZZLE: [] as string[], DOG: [] as string[] };
  const seen = new Set<string>();
  for (const s of latestMenuEng) {
    const name = s.recipe?.name || '?';
    if (seen.has(name)) continue;
    seen.add(name);
    if (menuClasses[s.classification as keyof typeof menuClasses]) {
      menuClasses[s.classification as keyof typeof menuClasses].push(name);
    }
  }

  return `CONTEXTO DO RESTAURANTE: ${restaurant?.name || 'Restaurante'}

RECEITAS ATIVAS (${recipes.length}):
${recipeSummary || 'Nenhuma receita cadastrada.'}

FATURAMENTO:
- Últimos 30 dias: R$${Number(sessions30d._sum?.price || 0).toFixed(2)} (${sessions30d._count} itens vendidos)
- Últimos 7 dias: R$${Number(sessions7d._sum?.price || 0).toFixed(2)} (${sessions7d._count} itens vendidos)

CMV ATUAL: ${latestCMV ? `${Number(latestCMV.cmvPercent || 0).toFixed(1)}% (alerta: ${latestCMV.alertLevel})` : 'Sem snapshot disponível'}

ENGENHARIA DE CARDÁPIO:
- Stars ⭐: ${menuClasses.STAR.join(', ') || 'nenhum'}
- Horses 🐴: ${menuClasses.HORSE.join(', ') || 'nenhum'}
- Puzzles 🧩: ${menuClasses.PUZZLE.join(', ') || 'nenhum'}
- Dogs 🐕: ${menuClasses.DOG.join(', ') || 'nenhum'}

ESTOQUE BAIXO (${lowStock.length} itens):
${lowStock.join('\n') || 'Nenhum item abaixo do mínimo.'}

INSUMOS CADASTRADOS: ${ingredients.length}
`;
}
