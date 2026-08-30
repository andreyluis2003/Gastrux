// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }


  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get('days') || '30', 10);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // Get all payments for revenue
  const payments = await prisma.payment.findMany({
    where: {
      restaurantId,
      createdAt: { gte: startDate },
    },
  });

  // Get cash flow records
  const cashFlowRecords = await prisma.cashFlowRecord.findMany({
    where: {
      date: { gte: startDate },
    },
  });

  // Get orders for average ticket
  const orders = await prisma.order.findMany({
    where: {
      restaurantId,
      createdAt: { gte: startDate },
    },
  });

  // Calculate metrics
  const totalRevenue = payments.reduce(
    (acc, p) => acc + parseFloat(p.amount.toString()),
    0
  );

  const totalExpenses = cashFlowRecords
    .filter((c) => c.type === 'EXPENSE')
    .reduce((acc, c) => acc + parseFloat(c.amount.toString()), 0);

  const totalIncome = cashFlowRecords
    .filter((c) => c.type === 'INCOME')
    .reduce((acc, c) => acc + parseFloat(c.amount.toString()), 0);

  const profit = totalIncome - totalExpenses;
  const profitMargin = totalIncome > 0 ? (profit / totalIncome) * 100 : 0;
  const averageTicket =
    orders.length > 0
      ? payments.reduce((acc, p) => acc + parseFloat(p.amount.toString()), 0) /
        orders.length
      : 0;

  const paymentMethods = payments.reduce((acc, p) => {
    acc[p.method] = (acc[p.method] || 0) + parseFloat(p.amount.toString());
    return acc;
  }, {});

  // Get top metrics
  const metrics = await prisma.financialMetric.findMany({
    where: {
      date: { gte: startDate },
    },
    orderBy: { date: 'desc' },
    take: 20,
  });

  // Get forecasts
  const forecasts = await prisma.financialForecast.findMany({
    where: {
      startDate: { gte: startDate },
    },
    orderBy: { startDate: 'desc' },
    take: 10,
  });

  return NextResponse.json({
    period: {
      days,
      startDate,
      endDate: new Date(),
    },
    summary: {
      totalRevenue: parseFloat(totalRevenue.toFixed(2)),
      totalExpenses: parseFloat(totalExpenses.toFixed(2)),
      totalIncome: parseFloat(totalIncome.toFixed(2)),
      profit: parseFloat(profit.toFixed(2)),
      profitMargin: parseFloat(profitMargin.toFixed(2)),
      averageTicket: parseFloat(averageTicket.toFixed(2)),
      paymentMethods,
      totalOrders: orders.length,
      totalPayments: payments.length,
    },
    metrics,
    forecasts,
  });
}
