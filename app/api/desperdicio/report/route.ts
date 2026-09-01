// @ts-nocheck
// Feature: Relatório de Desperdício - Dashboard data
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get('days') || '30');
    const start = new Date();
    start.setDate(start.getDate() - days);

    const restaurantUser = await prisma.restaurantUser.findFirst({ where: { userId: (session as any).user?.id || (session as any).id } });
    const restaurantId = restaurantUser?.restaurantId;
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
    }

    const wasteLogs = await prisma.wasteLog.findMany({
      where: { restaurantId, date: { gte: start } },
      include: { ingredient: { select: { name: true, standardUnit: true } } },
      orderBy: { date: 'desc' },
    });

    const totalCost = wasteLogs.reduce((s, w) => s + w.estimatedCost, 0);
    const totalQuantity = wasteLogs.reduce((s, w) => s + w.quantity, 0);

    // By reason
    const byReason: Record<string, { count: number; cost: number }> = {};
    wasteLogs.forEach((w) => {
      if (!byReason[w.reason]) byReason[w.reason] = { count: 0, cost: 0 };
      byReason[w.reason].count++;
      byReason[w.reason].cost += w.estimatedCost;
    });

    // By ingredient (top 10)
    const byIngredient: Record<string, { name: string; cost: number; qty: number }> = {};
    wasteLogs.forEach((w) => {
      const key = w.ingredientId;
      if (!byIngredient[key]) byIngredient[key] = { name: w.ingredient.name, cost: 0, qty: 0 };
      byIngredient[key].cost += w.estimatedCost;
      byIngredient[key].qty += w.quantity;
    });
    const topIngredients = Object.values(byIngredient).sort((a, b) => b.cost - a.cost).slice(0, 10);

    // Daily trend
    const dailyTrend: Record<string, { cost: number; count: number }> = {};
    wasteLogs.forEach((w) => {
      const day = w.date.toISOString().slice(0, 10);
      if (!dailyTrend[day]) dailyTrend[day] = { cost: 0, count: 0 };
      dailyTrend[day].cost += w.estimatedCost;
      dailyTrend[day].count++;
    });

    return NextResponse.json({
      summary: { totalCost, totalQuantity, totalRecords: wasteLogs.length, period: days },
      byReason,
      topIngredients,
      dailyTrend: Object.entries(dailyTrend).map(([date, data]) => ({ date, ...data })).sort((a, b) => a.date.localeCompare(b.date)),
      recentLogs: wasteLogs.slice(0, 20).map((w) => ({
        id: w.id, ingredient: w.ingredient.name, quantity: w.quantity, unit: w.unit,
        cost: w.estimatedCost, reason: w.reason, notes: w.notes, date: w.date,
      })),
    });
  } catch (error) {
    console.error('Error fetching waste report:', error);
    return NextResponse.json({ error: 'Erro ao gerar relat\u00f3rio' }, { status: 500 });
  }
}
