// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

// Get quick financial summary for today
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }


  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Today's revenue
  const todayPayments = await prisma.payment.findMany({
    where: {
      restaurantId,
      createdAt: { gte: today, lt: tomorrow },
    },
  });

  // Today's orders
  const todayOrders = await prisma.order.findMany({
    where: {
      restaurantId,
      createdAt: { gte: today, lt: tomorrow },
    },
    select: {
      id: true,
      total: true,
      items: { select: { id: true } },
    },
  });

  // Today's cash flow
  const todayCashFlow = await prisma.cashFlowRecord.findMany({
    where: {
      restaurantId,
      date: { gte: today, lt: tomorrow },
    },
  });

  const revenue = todayPayments.reduce(
    (acc, p) => acc + parseFloat(p.amount.toString()),
    0
  );

  const expenses = todayCashFlow
    .filter((c) => c.type === 'EXPENSE')
    .reduce((acc, c) => acc + parseFloat(c.amount.toString()), 0);

  const income = todayCashFlow
    .filter((c) => c.type === 'INCOME')
    .reduce((acc, c) => acc + parseFloat(c.amount.toString()), 0);

  const profit = income - expenses;
  const margin = income > 0 ? (profit / income) * 100 : 0;

  return NextResponse.json({
    date: today,
    revenue: parseFloat(revenue.toFixed(2)),
    expenses: parseFloat(expenses.toFixed(2)),
    income: parseFloat(income.toFixed(2)),
    profit: parseFloat(profit.toFixed(2)),
    margin: parseFloat(margin.toFixed(2)),
    orders: todayOrders.length,
    items: todayOrders.reduce((acc, o) => acc + o.items.length, 0),
    transactions: todayPayments.length,
  });
}
