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
  const type = searchParams.get('type');
  const category = searchParams.get('category');
  const status = searchParams.get('status');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  const where: any = { restaurantId };
  if (type) where.type = type;
  if (category) where.category = category;
  if (status) where.status = status;

  if (startDate && endDate) {
    where.date = {
      gte: new Date(startDate),
      lte: new Date(endDate),
    };
  }

  const records = await prisma.cashFlowRecord.findMany({
    where,
    include: {
      payment: {
        select: {
          id: true,
          method: true,
          status: true,
          amount: true,
        },
      },
    },
    orderBy: { date: 'desc' },
    take: 100,
  });

  return NextResponse.json(records);
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
  const { type, category, amount, description, date, status, paymentId } = body;

  if (!type || !category || amount === undefined) {
    return NextResponse.json(
      { error: 'Missing required fields' },
      { status: 400 }
    );
  }

  const record = await prisma.cashFlowRecord.create({
    data: {
      restaurantId,
      type,
      category,
      amount: parseFloat(amount),
      description,
      date: date ? new Date(date) : new Date(),
      status: status || 'COMPLETED',
      paymentId,
    },
    include: {
      payment: true,
    },
  });

  return NextResponse.json(record);
}
