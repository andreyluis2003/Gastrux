// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const forecastType = searchParams.get('forecastType');
  const method = searchParams.get('method');

  const where: any = {};
  if (forecastType) where.forecastType = forecastType;
  if (method) where.method = method;

  const forecasts = await prisma.financialForecast.findMany({
    where,
    orderBy: { startDate: 'desc' },
    take: 50,
  });

  return NextResponse.json(forecasts);
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const {
    forecastType,
    startDate,
    endDate,
    forecastedValue,
    confidence,
    method,
  } = body;

  if (!forecastType || !startDate || !endDate || forecastedValue === undefined) {
    return NextResponse.json(
      { error: 'Missing required fields' },
      { status: 400 }
    );
  }

  const forecast = await prisma.financialForecast.create({
    data: {
      forecastType,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      forecastedValue: parseFloat(forecastedValue),
      confidence: confidence ? parseFloat(confidence) : null,
      method: method || 'simple_average',
    },
  });

  return NextResponse.json(forecast);
}
