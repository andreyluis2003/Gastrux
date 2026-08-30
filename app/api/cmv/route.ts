// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }


    const { searchParams } = new URL(req.url);
    const period = searchParams.get('period') || '30';
    const days = parseInt(period);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const prevStartDate = new Date();
    prevStartDate.setDate(prevStartDate.getDate() - days * 2);

    // Current period: purchases (ENTRY) and consumption (MANUAL_DEDUCTION + AUTO_DEDUCTION + LOSS)
    const movements = await prisma.stockMovement.findMany({
      where: { restaurantId, createdAt: { gte: startDate } },
      include: { ingredient: { select: { name: true, referenceCost: true, standardUnit: true } } },
    });

    const prevMovements = await prisma.stockMovement.findMany({
      where: { restaurantId, createdAt: { gte: prevStartDate, lt: startDate } },
      include: { ingredient: { select: { name: true, referenceCost: true } } },
    });

    // Calculate CMV = Estoque Inicial + Compras - Estoque Final
    // Simplified: CMV ≈ sum of consumption costs
    let purchases = 0;
    let consumption = 0;
    let losses = 0;
    const byIngredient: Record<string, { name: string; purchases: number; consumption: number; losses: number }> = {};

    for (const m of movements) {
      const cost = m.quantity * (m.ingredient.referenceCost || 0);
      const key = m.ingredientId;
      if (!byIngredient[key]) byIngredient[key] = { name: m.ingredient.name, purchases: 0, consumption: 0, losses: 0 };

      if (m.movementType === 'ENTRY') {
        purchases += cost;
        byIngredient[key].purchases += cost;
      } else if (m.movementType === 'LOSS') {
        losses += cost;
        byIngredient[key].losses += cost;
      } else if (m.movementType !== 'ADJUSTMENT') {
        consumption += cost;
        byIngredient[key].consumption += cost;
      }
    }

    let prevPurchases = 0;
    let prevConsumption = 0;
    for (const m of prevMovements) {
      const cost = m.quantity * (m.ingredient.referenceCost || 0);
      if (m.movementType === 'ENTRY') prevPurchases += cost;
      else if (m.movementType !== 'ADJUSTMENT' && m.movementType !== 'LOSS') prevConsumption += cost;
    }

    const cmv = consumption + losses;
    const prevCmv = prevConsumption;
    const cmvChange = prevCmv > 0 ? ((cmv - prevCmv) / prevCmv) * 100 : 0;

    // Get total recipe revenue estimate (from production plans)
    const plans = await prisma.productionPlanItem.findMany({
      where: { restaurantId, plan: { planDate: { gte: startDate } } },
      include: { recipe: { select: { sellingPrice: true, costPerPortion: true, name: true } } },
    });

    let estimatedRevenue = 0;
    for (const p of plans) {
      if (p.recipe.sellingPrice) estimatedRevenue += p.quantity * p.recipe.sellingPrice;
    }

    const cmvPercent = estimatedRevenue > 0 ? (cmv / estimatedRevenue) * 100 : 0;

    // Top 5 by consumption cost
    const topIngredients = Object.entries(byIngredient)
      .sort((a, b) => (b[1].consumption + b[1].losses) - (a[1].consumption + a[1].losses))
      .slice(0, 10)
      .map(([id, data]) => ({ id, ...data, total: data.consumption + data.losses }));

    // Daily breakdown for chart
    const dailyData: Record<string, { date: string; purchases: number; consumption: number }> = {};
    for (const m of movements) {
      const day = m.createdAt.toISOString().split('T')[0];
      if (!dailyData[day]) dailyData[day] = { date: day, purchases: 0, consumption: 0 };
      const cost = m.quantity * (m.ingredient.referenceCost || 0);
      if (m.movementType === 'ENTRY') dailyData[day].purchases += cost;
      else if (m.movementType !== 'ADJUSTMENT') dailyData[day].consumption += cost;
    }

    const dailyChart = Object.values(dailyData).sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      period: days,
      cmv,
      cmvPercent,
      cmvChange,
      purchases,
      consumption,
      losses,
      estimatedRevenue,
      topIngredients,
      dailyChart,
      idealRange: { min: 28, max: 35 },
    });
  } catch (error) {
    console.error('CMV API error:', error);
    return NextResponse.json({ error: 'Erro ao calcular CMV' }, { status: 500 });
  }
}
