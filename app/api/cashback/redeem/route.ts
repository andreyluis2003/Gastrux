// Cashback redemption endpoint
// POST /api/cashback/redeem { customerId, points, orderId }
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante n\u00e3o encontrado' }, { status: 403 });
    }

    const { customerId, points, orderId } = await req.json();
    if (!customerId || !points || points <= 0) {
      return NextResponse.json({ error: 'customerId e points obrigat\u00f3rios' }, { status: 400 });
    }

    const account = await prisma.customerLoyaltyAccount.findFirst({
      where: { customerId, active: true, program: { restaurantId } },
      include: { program: true },
    });

    if (!account) {
      return NextResponse.json({ error: 'Conta de fidelidade n\u00e3o encontrada' }, { status: 404 });
    }

    if (account.currentPoints < points) {
      return NextResponse.json({ error: `Saldo insuficiente. Dispon\u00edvel: ${account.currentPoints} pontos` }, { status: 400 });
    }

    if (points < account.program.minPointsToRedeem) {
      return NextResponse.json({ error: `M\u00ednimo para resgate: ${account.program.minPointsToRedeem} pontos` }, { status: 400 });
    }

    const balanceBefore = account.currentPoints;
    const balanceAfter = balanceBefore - points;
    const discountValue = points; // 1 ponto = R$1

    // The check above and the deduct below must be one atomic operation -
    // otherwise two concurrent redeem requests can both pass the balance
    // check before either write lands, redeeming more than the customer
    // actually had.
    const redeemResult = await prisma.customerLoyaltyAccount.updateMany({
      where: { id: account.id, currentPoints: { gte: points } },
      data: {
        currentPoints: { decrement: points },
        totalPointsRedeemed: { increment: points },
        lastActivityAt: new Date(),
      },
    });
    if (redeemResult.count === 0) {
      return NextResponse.json({ error: `Saldo insuficiente. Dispon\u00edvel: ${account.currentPoints} pontos` }, { status: 400 });
    }

    await prisma.loyaltyTransaction.create({
      data: {
        customerId,
        accountId: account.id,
        programId: account.program.id,
        type: 'REDEMPTION',
        amount: -points,
        reason: `Resgate de cashback${orderId ? ' - Pedido' : ''}`,
        orderId: orderId || null,
        balanceBefore,
        balanceAfter,
      },
    });

    return NextResponse.json({
      success: true,
      pointsRedeemed: points,
      discountValue,
      newBalance: balanceAfter,
    });
  } catch (error) {
    console.error('Error redeeming cashback:', error);
    return NextResponse.json({ error: 'Erro ao resgatar cashback' }, { status: 500 });
  }
}
