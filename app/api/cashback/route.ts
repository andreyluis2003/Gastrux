// Feature #9: Cashback — sistema de créditos para clientes
// GET: Get cashback config + customer balance
// POST: Credit cashback on order completion
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';
import { getOrCreateLoyaltyProgram, getRestaurantIdForCustomer } from '@/lib/loyalty/get-program';

export const dynamic = 'force-dynamic';

const DEFAULT_CASHBACK_PERCENT = 5; // 5% cashback
const POINTS_PER_REAL = 1; // 1 ponto = R$1

// GET /api/cashback?customerId=xxx
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get('customerId');

    if (!customerId) {
      // Return general cashback config (escopado pela loja da sessão)
      const restaurantId = await getCurrentRestaurantId();
      const program = restaurantId ? await getOrCreateLoyaltyProgram(restaurantId) : null;
      return NextResponse.json({
        cashbackPercent: DEFAULT_CASHBACK_PERCENT,
        program: program || null,
      });
    }

    // Get customer loyalty account
    const account = await prisma.customerLoyaltyAccount.findFirst({
      where: { customerId, active: true },
      include: {
        program: true,
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!account) {
      return NextResponse.json({
        balance: 0,
        cashbackPercent: DEFAULT_CASHBACK_PERCENT,
        totalEarned: 0,
        totalRedeemed: 0,
        transactions: [],
      });
    }

    return NextResponse.json({
      balance: account.currentPoints,
      cashbackPercent: Number(account.program.pointsPerReal) * DEFAULT_CASHBACK_PERCENT,
      totalEarned: account.totalPointsEarned,
      totalRedeemed: account.totalPointsRedeemed,
      tier: account.tier,
      transactions: account.transactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        reason: t.reason,
        date: t.createdAt,
        balanceAfter: t.balanceAfter,
      })),
    });
  } catch (error) {
    console.error('Error fetching cashback:', error);
    return NextResponse.json({ error: 'Erro ao buscar cashback' }, { status: 500 });
  }
}

// POST /api/cashback { customerId, orderId, orderTotal }
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { customerId, orderId, orderTotal } = await req.json();
    if (!customerId || !orderId || !orderTotal) {
      return NextResponse.json({ error: 'customerId, orderId e orderTotal obrigat\u00f3rios' }, { status: 400 });
    }

    // Find or create program escopado pela loja do cliente (isolamento multi-tenant)
    const restaurantId = await getRestaurantIdForCustomer(customerId);
    const program = await getOrCreateLoyaltyProgram(restaurantId);

    // Find or create loyalty account
    let account = await prisma.customerLoyaltyAccount.findFirst({
      where: { customerId, programId: program.id },
    });
    if (!account) {
      account = await prisma.customerLoyaltyAccount.create({
        data: {
          customerId,
          programId: program.id,
          currentPoints: 0,
          totalPointsEarned: 0,
          totalPointsRedeemed: 0,
        },
      });
    }

    // Calculate cashback points
    const cashbackAmount = Math.floor(orderTotal * DEFAULT_CASHBACK_PERCENT / 100);
    if (cashbackAmount <= 0) {
      return NextResponse.json({ success: true, pointsEarned: 0, newBalance: account.currentPoints });
    }

    const balanceBefore = account.currentPoints;
    const balanceAfter = balanceBefore + cashbackAmount;

    // Create transaction
    await prisma.loyaltyTransaction.create({
      data: {
        customerId,
        accountId: account.id,
        programId: program.id,
        type: 'EARNING',
        amount: cashbackAmount,
        reason: `Cashback ${DEFAULT_CASHBACK_PERCENT}% - Pedido`,
        orderId,
        balanceBefore,
        balanceAfter,
      },
    });

    // Update account
    await prisma.customerLoyaltyAccount.update({
      where: { id: account.id },
      data: {
        currentPoints: { increment: cashbackAmount },
        totalPointsEarned: { increment: cashbackAmount },
        lastActivityAt: new Date(),
      },
    });

    // Update customer totals
    await prisma.customer.update({
      where: { id: customerId },
      data: {
        totalSpent: { increment: orderTotal },
        totalOrders: { increment: 1 },
        lastOrderAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      pointsEarned: cashbackAmount,
      newBalance: balanceAfter,
      cashbackPercent: DEFAULT_CASHBACK_PERCENT,
    });
  } catch (error) {
    console.error('Error crediting cashback:', error);
    return NextResponse.json({ error: 'Erro ao creditar cashback' }, { status: 500 });
  }
}
