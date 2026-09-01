// @ts-nocheck
import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { checkTransactionLimit, incrementTransactionCount } from '@/lib/transaction-limiter';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

// GET: Retrieve POS transactions with filters
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }

    const searchParams = req.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '7');
    const status = searchParams.get('status');
    const provider = searchParams.get('provider');

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const where: any = {
      restaurantId,
      transactionDate: { gte: startDate },
    };

    if (status) where.status = status;
    if (provider) where.provider = provider;

    const transactions = await prisma.pOSTransaction.findMany({
      where,
      orderBy: { transactionDate: 'desc' },
      take: 100,
    });

    // Parse items JSON
    const formattedTransactions = transactions.map((t) => ({
      ...t,
      items: JSON.parse(t.items || '[]'),
    }));

    // Calculate summary
    const summary = {
      totalTransactions: transactions.length,
      totalRevenue: transactions.reduce((sum, t) => sum + t.amount, 0),
      avgTransaction: transactions.length > 0
        ? transactions.reduce((sum, t) => sum + t.amount, 0) / transactions.length
        : 0,
      byStatus: {
        COMPLETED: transactions.filter((t) => t.status === 'COMPLETED').length,
        FAILED: transactions.filter((t) => t.status === 'FAILED').length,
        REFUNDED: transactions.filter((t) => t.status === 'REFUNDED').length,
      },
    };

    return NextResponse.json({
      transactions: formattedTransactions,
      summary,
    });
  } catch (error) {
    console.error('GET transactions error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transactions' },
      { status: 500 }
    );
  }
}

// POST: Register POS transaction (from Square/Sumup webhook)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }

    // Check transaction limit BEFORE processing
    const limitCheck = await checkTransactionLimit(session.user.id);
    if (!limitCheck.allowed) {
      return NextResponse.json(
        {
          error: 'Limite de transações atingido',
          message: limitCheck.message,
          tier: limitCheck.tier,
          limit: limitCheck.limit,
          remaining: limitCheck.remaining,
          suggestUpgrade: limitCheck.tier === 'starter',
        },
        { status: 429 }
      );
    }

    const body = await req.json();
    const {
      transactionId,
      provider,
      amount,
      paymentMethod,
      status,
      items,
      receiptUrl,
      customerId,
      notes,
      transactionDate,
    } = body;

    // Check if transaction already exists
    const existing = await prisma.pOSTransaction.findUnique({
      where: { transactionId },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Transaction already registered' },
        { status: 409 }
      );
    }

    // Create transaction
    const transaction = await prisma.pOSTransaction.create({
      data: {
        restaurantId,
        transactionId,
        provider,
        amount,
        paymentMethod,
        status,
        items: JSON.stringify(items || []),
        receiptUrl,
        customerId,
        notes,
        transactionDate: new Date(transactionDate || Date.now()),
      },
    });

    // Increment transaction counter ONLY after success
    await incrementTransactionCount(session.user.id);

    return NextResponse.json(
      {
        success: true,
        transaction,
        transactionLimit: {
          limit: limitCheck.limit,
          remaining: limitCheck.remaining - 1,
          tier: limitCheck.tier,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST transaction error:', error);
    return NextResponse.json(
      { error: 'Failed to register transaction' },
      { status: 500 }
    );
  }
}
