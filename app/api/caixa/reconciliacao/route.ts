// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET reconciliation data for a cash register
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const cashRegisterId = req.nextUrl.searchParams.get('cashRegisterId');
    if (!cashRegisterId) {
      return NextResponse.json(
        { error: 'Cash register ID is required' },
        { status: 400 }
      );
    }

    const register = await prisma.cashRegister.findUnique({
      where: { id: cashRegisterId },
      include: {
        movements: {
          orderBy: { createdAt: 'desc' },
        },
        transactions: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!register) {
      return NextResponse.json(
        { error: 'Cash register not found' },
        { status: 404 }
      );
    }

    // Calculate differences
    const actualBalanceNum = parseFloat(register.actualBalance.toString());
    const expectedBalanceNum = parseFloat(register.expectedBalance.toString());
    const difference = actualBalanceNum - expectedBalanceNum;
    const isBalanced = Math.abs(difference) < 0.01; // Allow 0.01 tolerance for rounding

    return NextResponse.json({
      register,
      reconciliation: {
        openingBalance: parseFloat(register.openingBalance.toString()),
        expectedBalance: expectedBalanceNum,
        actualBalance: actualBalanceNum,
        difference,
        isBalanced,
        totalTransactions: register.transactions.reduce((sum, t) => sum + parseFloat(t.amount.toString()), 0),
        totalMovements: register.movements.length,
      },
    });
  } catch (error) {
    console.error('Error getting reconciliation data:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST confirm closing of cash register
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { cashRegisterId, actualBalance } = body;

    if (!cashRegisterId || actualBalance === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const register = await prisma.cashRegister.update({
      where: { id: cashRegisterId },
      data: {
        actualBalance: parseFloat(actualBalance),
        closedAt: new Date(),
        active: false,
      },
    });

    return NextResponse.json(register);
  } catch (error) {
    console.error('Error closing cash register:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
