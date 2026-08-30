// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { customerId, accountId, rewardId } = body;

    // Verify reward exists
    const reward = await prisma.loyaltyReward.findUnique({
      where: { id: rewardId },
      include: { program: true },
    });

    if (!reward) {
      return NextResponse.json(
        { error: 'Recompensa não encontrada' },
        { status: 404 }
      );
    }

    // Verify account exists and has enough points
    const account = await prisma.customerLoyaltyAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      return NextResponse.json(
        { error: 'Conta de fidelização não encontrada' },
        { status: 404 }
      );
    }

    if (account.currentPoints < reward.pointsCost) {
      return NextResponse.json(
        { error: 'Pontos insuficientes para resgatar esta recompensa' },
        { status: 400 }
      );
    }

    // Check max redemptions
    if (reward.maxRedemptions && reward.currentRedemptions >= reward.maxRedemptions) {
      return NextResponse.json(
        { error: 'Esta recompensa atingiu o limite de resgates' },
        { status: 400 }
      );
    }

    // Process the redemption
    const newPoints = account.currentPoints - reward.pointsCost;

    const [transaction, updatedAccount, updatedReward] = await Promise.all([
      prisma.loyaltyTransaction.create({
        data: {
          customerId,
          accountId,
          programId: account.programId,
          type: 'REDEMPTION',
          amount: reward.pointsCost,
          reason: `Resgate: ${reward.name}`,
          rewardId,
          balanceBefore: account.currentPoints,
          balanceAfter: newPoints,
        },
      }),
      prisma.customerLoyaltyAccount.update({
        where: { id: accountId },
        data: {
          currentPoints: newPoints,
          totalPointsRedeemed: {
            increment: reward.pointsCost,
          },
          lastActivityAt: new Date(),
        },
      }),
      prisma.loyaltyReward.update({
        where: { id: rewardId },
        data: {
          currentRedemptions: {
            increment: 1,
          },
        },
      }),
    ]);

    return NextResponse.json({
      transaction,
      updatedAccount,
      message: `Recompensa '${reward.name}' resgatada com sucesso!`,
    });
  } catch (error) {
    console.error('Error redeeming reward:', error);
    return NextResponse.json(
      { error: 'Failed to redeem reward' },
      { status: 500 }
    );
  }
}
