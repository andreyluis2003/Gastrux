// Cashback redemption endpoint
// POST /api/cashback/redeem { customerId, points, orderId }
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { customerId, points, orderId } = await req.json();
    if (!customerId || !points || points <= 0) {
      return NextResponse.json({ error: 'customerId e points obrigat\u00f3rios' }, { status: 400 });
    }

    const account = await prisma.customerLoyaltyAccount.findFirst({
      where: { customerId, active: true },
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

    await prisma.customerLoyaltyAccount.update({
      where: { id: account.id },
      data: {
        currentPoints: { decrement: points },
        totalPointsRedeemed: { increment: points },
        lastActivityAt: new Date(),
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
