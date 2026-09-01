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
  const metricType = searchParams.get('metricType');
  const period = searchParams.get('period') || 'daily';
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  const where: any = { restaurantId };
  if (metricType) where.metricType = metricType;
  where.period = period;

  if (startDate && endDate) {
    where.date = {
      gte: new Date(startDate),
      lte: new Date(endDate),
    };
  }

  const metrics = await prisma.financialMetric.findMany({
    where,
    orderBy: { date: 'desc' },
    take: 100,
  });

  return NextResponse.json(metrics);
}

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
  const { metricType, period, value, target, date } = body;

  if (!metricType || !period || value === undefined) {
    return NextResponse.json(
      { error: 'Missing required fields' },
      { status: 400 }
    );
  }

  const metric = await prisma.financialMetric.create({
    data: {
      restaurantId,
      metricType,
      period,
      value: parseFloat(value),
      target: target ? parseFloat(target) : null,
      date: date ? new Date(date) : new Date(),
    },
  });

  return NextResponse.json(metric);
}
