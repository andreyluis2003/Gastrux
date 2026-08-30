// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// POST create cash movement (sangria, refund, etc)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { cashRegisterId, type, amount, description, reference, operatorName, notes } = body;

    if (!cashRegisterId || !type || amount === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Verify cash register exists
    const register = await prisma.cashRegister.findUnique({
      where: { id: cashRegisterId },
    });

    if (!register) {
      return NextResponse.json(
        { error: 'Cash register not found' },
        { status: 404 }
      );
    }

    // Create movement
    const movement = await prisma.cashMovement.create({
      data: {
        cashRegisterId,
        type,
        amount: parseFloat(amount),
        description,
        reference,
        operatorName,
        notes,
        createdBy: session.user?.id,
      },
    });

    // Update expected balance
    const isDebit = ['WITHDRAWAL', 'REFUND'].includes(type);
    const adjustment = isDebit ? -parseFloat(amount) : parseFloat(amount);
    
    await prisma.cashRegister.update({
      where: { id: cashRegisterId },
      data: {
        expectedBalance: {
          increment: adjustment,
        },
      },
    });

    return NextResponse.json(movement, { status: 201 });
  } catch (error) {
    console.error('Error creating cash movement:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
