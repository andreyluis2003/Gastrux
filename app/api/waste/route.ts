// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { safeHandler } from '@/lib/api/safe-handler';
import { ApiErrors } from '@/lib/api/api-response';
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
    const period = parseInt(searchParams.get('period') || '30');
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - period);

    const wasteLogs = await prisma.wasteLog.findMany({
      where: { restaurantId, date: { gte: startDate } },
      include: { ingredient: { select: { name: true, code: true, standardUnit: true, category: { select: { name: true } } } } },
      orderBy: { date: 'desc' },
    });

    // Summary stats
    const totalCost = wasteLogs.reduce((sum, w) => sum + w.estimatedCost, 0);
    const totalItems = wasteLogs.length;

    // By reason
    const byReason: Record<string, { count: number; cost: number }> = {};
    for (const w of wasteLogs) {
      if (!byReason[w.reason]) byReason[w.reason] = { count: 0, cost: 0 };
      byReason[w.reason].count++;
      byReason[w.reason].cost += w.estimatedCost;
    }

    // By ingredient (top wasted)
    const byIngredient: Record<string, { name: string; count: number; cost: number; quantity: number }> = {};
    for (const w of wasteLogs) {
      const key = w.ingredientId;
      if (!byIngredient[key]) byIngredient[key] = { name: w.ingredient.name, count: 0, cost: 0, quantity: 0 };
      byIngredient[key].count++;
      byIngredient[key].cost += w.estimatedCost;
      byIngredient[key].quantity += w.quantity;
    }

    const topWasted = Object.entries(byIngredient)
      .sort((a, b) => b[1].cost - a[1].cost)
      .slice(0, 10)
      .map(([id, data]) => ({ id, ...data }));

    // Daily chart
    const dailyData: Record<string, number> = {};
    for (const w of wasteLogs) {
      const day = w.date.toISOString().split('T')[0];
      dailyData[day] = (dailyData[day] || 0) + w.estimatedCost;
    }
    const dailyChart = Object.entries(dailyData)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, cost]) => ({ date, cost }));

    const response = NextResponse.json({
      wasteLogs,
      totalCost,
      totalItems,
      byReason,
      topWasted,
      dailyChart,
    });
    // Ensure browsers/CDNs never serve a stale list — newly registered
    // waste logs must always appear immediately after creation.
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    return response;
  } catch (error) {
    console.error('Waste API error:', error);
    return NextResponse.json({ error: 'Erro ao buscar desperdício' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }

    const body = await req.json();
    const { ingredientId, quantity, unit, reason, notes } = body;

    if (!ingredientId || !quantity || !reason) {
      return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 });
    }

    // Get ingredient cost
    const ingredient = await prisma.ingredient.findUnique({ where: { id: ingredientId } });
    if (!ingredient) return NextResponse.json({ error: 'Insumo não encontrado' }, { status: 404 });

    const estimatedCost = quantity * ingredient.referenceCost;

    const wasteLog = await prisma.wasteLog.create({
      data: {
        restaurantId,
        ingredientId,
        quantity: parseFloat(String(quantity)),
        unit: unit || ingredient.standardUnit,
        estimatedCost,
        reason,
        notes,
      },
      include: { ingredient: { select: { name: true, code: true, standardUnit: true } } },
    });

    // Also create a LOSS stock movement
    await prisma.stockMovement.create({
      data: {
        restaurantId,
        ingredientId,
        type: 'LOSS',
        quantity: -parseFloat(String(quantity)),
        unit: unit || ingredient.standardUnit,
        reason: `Desperdício: ${reason}`,
      },
    });

    // Update stock if exists
    const currentStock = await prisma.stock.findUnique({ where: { ingredientId } });
    if (currentStock) {
      await prisma.stock.update({
        where: { ingredientId },
        data: {
          currentQuantity: { decrement: parseFloat(String(quantity)) },
        },
      });
    }

    return NextResponse.json(wasteLog, { status: 201 });
  } catch (error) {
    console.error('Waste POST error:', error);
    return NextResponse.json({ error: 'Erro ao registrar desperdício' }, { status: 500 });
  }
}
