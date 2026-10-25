// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { salesInRange } from '@/lib/finance/month-sales';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Owner-and-manager data: the cook and the cashier are refused (prod audit 2026-10-17)
  const gate = await requireRestaurantRole(MANAGER_ROLES);
  if (!gate.ok) return gate.response;
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
    // Stock-count differences: ADJUSTMENT quantities are signed (+ surplus, - shortage), so a
    // shortage found by the count costs (-quantity x cost) and a surplus gives it back
    let unidentifiedLosses = 0;
    const byIngredient: Record<string, { name: string; purchases: number; consumption: number; losses: number }> = {};

    for (const m of movements) {
      const cost = m.quantity * (m.ingredient.referenceCost || 0);
      // Sales, manual withdrawals and losses are written with a negative quantity: as a cost they count by size
      const out = Math.abs(cost);
      const key = m.ingredientId;
      if (!byIngredient[key]) byIngredient[key] = { name: m.ingredient.name, purchases: 0, consumption: 0, losses: 0 };

      if (m.movementType === 'ENTRY') {
        purchases += cost;
        byIngredient[key].purchases += cost;
      } else if (m.movementType === 'LOSS') {
        losses += out;
        byIngredient[key].losses += out;
      } else if (m.movementType === 'ADJUSTMENT') {
        unidentifiedLosses -= cost;
        byIngredient[key].losses -= cost;
      } else {
        consumption += out;
        byIngredient[key].consumption += out;
      }
    }

    let prevPurchases = 0;
    let prevConsumption = 0;
    for (const m of prevMovements) {
      const cost = m.quantity * (m.ingredient.referenceCost || 0);
      // Sales, manual withdrawals and losses are written with a negative quantity: as a cost they count by size
      const out = Math.abs(cost);
      if (m.movementType === 'ENTRY') prevPurchases += cost;
      else if (m.movementType === 'ADJUSTMENT') prevConsumption -= cost;
      else if (m.movementType !== 'LOSS') prevConsumption += out;
    }

    const cmv = consumption + losses + unidentifiedLosses;
    const prevCmv = prevConsumption;
    const cmvChange = prevCmv > 0 ? ((cmv - prevCmv) / prevCmv) * 100 : 0;

    // The period's sales, the Caixa and DRE criterion (it was the production plans: R$ 0,00 for a restaurant that
    // sells without plans, found in the video screenshots 2026-10-24)
    const estimatedRevenue = (await salesInRange(restaurantId, startDate, new Date())).totalCents / 100;

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
      // Sales, manual withdrawals and losses are written with a negative quantity: as a cost they count by size
      const out = Math.abs(cost);
      if (m.movementType === 'ENTRY') dailyData[day].purchases += cost;
      else if (m.movementType === 'ADJUSTMENT') dailyData[day].consumption -= cost;
      else dailyData[day].consumption += out;
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
      unidentifiedLosses,
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
