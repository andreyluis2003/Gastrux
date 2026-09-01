// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

// Calculate financial forecast based on historical data
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }


  const body = await request.json();
  const { type, days = 30, method = 'simple_average' } = body;

  if (!type) {
    return NextResponse.json({ error: 'Type is required' }, { status: 400 });
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // Get historical data based on type
  let historicalData = [];

  if (type === 'revenue') {
    const payments = await prisma.payment.findMany({
      where: {
        restaurantId,
        createdAt: { gte: startDate },
      },
    });
    historicalData = payments.map((p) => ({
      date: p.createdAt,
      value: parseFloat(p.amount.toString()),
    }));
  } else if (type === 'orders') {
    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        createdAt: { gte: startDate },
      },
      select: { id: true, createdAt: true },
    });
    historicalData = orders.map((o) => ({
      date: o.createdAt,
      value: 1,
    }));
  } else if (type === 'cash_flow') {
    const records = await prisma.cashFlowRecord.findMany({
      where: {
        restaurantId,
        date: { gte: startDate },
      },
    });
    historicalData = records.map((r) => ({
      date: r.date,
      value: parseFloat(r.amount.toString()) * (r.type === 'EXPENSE' ? -1 : 1),
    }));
  }

  // Calculate forecast
  let forecastedValue = 0;
  let confidence = 0.8;

  if (historicalData.length > 0) {
    if (method === 'simple_average') {
      const sum = historicalData.reduce((acc, d) => acc + d.value, 0);
      forecastedValue = sum / historicalData.length;
      confidence = 0.7; // Simple average has lower confidence
    } else if (method === 'weighted_average') {
      // Recent data weighted more heavily
      const weights = historicalData.map((_, i) => (i + 1) / historicalData.length);
      const weightedSum = historicalData.reduce(
        (acc, d, i) => acc + d.value * weights[i],
        0
      );
      forecastedValue = weightedSum;
      confidence = 0.75;
    } else if (method === 'trend_analysis') {
      // Linear regression
      const n = historicalData.length;
      const x = Array.from({ length: n }, (_, i) => i);
      const y = historicalData.map((d) => d.value);
      const xMean = x.reduce((a, b) => a + b) / n;
      const yMean = y.reduce((a, b) => a + b) / n;
      const numerator = x.reduce((acc, xi, i) => acc + (xi - xMean) * (y[i] - yMean), 0);
      const denominator = x.reduce((acc, xi) => acc + (xi - xMean) ** 2, 0);
      const slope = denominator !== 0 ? numerator / denominator : 0;
      forecastedValue = yMean + slope * (n - 1);
      confidence = 0.85;
    }
  }

  // Create forecast record
  const forecast = await prisma.financialForecast.create({
    data: {
      restaurantId,
      forecastType: type,
      startDate: new Date(),
      endDate: new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      forecastedValue,
      confidence,
      method,
    },
  });

  return NextResponse.json({
    forecast,
    historicalDataPoints: historicalData.length,
    calculation: {
      method,
      confidence,
      value: parseFloat(forecastedValue.toFixed(2)),
    },
  });
}
