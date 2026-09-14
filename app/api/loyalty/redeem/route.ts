// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // The reward and the loyalty account must both belong to the caller's
    // own restaurant - the original version resolved them by id alone,
    // which let any authenticated user redeem another restaurant's reward
    // using another restaurant's customer's points.
    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
    }

    const body = await request.json();
    const { accountId, rewardId } = body;

    // Verify reward exists and belongs to this restaurant's loyalty program
    const reward = await prisma.loyaltyReward.findFirst({
      where: { id: rewardId, program: { restaurantId } },
      include: { program: true },
    });

    if (!reward) {
      return NextResponse.json(
        { error: 'Recompensa não encontrada' },
        { status: 404 }
      );
    }

    // Verify account exists, belongs to this restaurant, and is enrolled in
    // the same program as the reward (an account's points from one program
    // can't be spent on another program's rewards). customerId is derived
    // from the account itself rather than trusted from the request body, so
    // the redemption can't be logged against an arbitrary customer.
    const account = await prisma.customerLoyaltyAccount.findFirst({
      where: { id: accountId, programId: reward.programId, program: { restaurantId } },
    });

    if (!account) {
      return NextResponse.json(
        { error: 'Conta de fidelização não encontrada' },
        { status: 404 }
      );
    }

    // Process the redemption atomically. Checking the balance/cap and then
    // writing it separately (as this used to) lets two concurrent redeem
    // requests both pass the check before either write lands - a customer
    // could redeem a reward twice while only ever spending the points once.
    // A single conditional update makes the check-and-deduct one atomic
    // operation, so only one of two racing requests can ever succeed.
    const pointsResult = await prisma.customerLoyaltyAccount.updateMany({
      where: { id: accountId, currentPoints: { gte: reward.pointsCost } },
      data: {
        currentPoints: { decrement: reward.pointsCost },
        totalPointsRedeemed: { increment: reward.pointsCost },
        lastActivityAt: new Date(),
      },
    });
    if (pointsResult.count === 0) {
      return NextResponse.json(
        { error: 'Pontos insuficientes para resgatar esta recompensa' },
        { status: 400 }
      );
    }

    const rewardResult = await prisma.loyaltyReward.updateMany({
      where: reward.maxRedemptions
        ? { id: rewardId, currentRedemptions: { lt: reward.maxRedemptions } }
        : { id: rewardId },
      data: { currentRedemptions: { increment: 1 } },
    });
    if (rewardResult.count === 0) {
      // Reward hit its redemption cap between our check and the points
      // deduction above - refund the points before rejecting.
      await prisma.customerLoyaltyAccount.update({
        where: { id: accountId },
        data: {
          currentPoints: { increment: reward.pointsCost },
          totalPointsRedeemed: { decrement: reward.pointsCost },
        },
      });
      return NextResponse.json(
        { error: 'Esta recompensa atingiu o limite de resgates' },
        { status: 400 }
      );
    }

    const [updatedAccount, transaction] = await Promise.all([
      prisma.customerLoyaltyAccount.findUniqueOrThrow({ where: { id: accountId } }),
      prisma.loyaltyTransaction.create({
        data: {
          customerId: account.customerId,
          accountId,
          programId: account.programId,
          type: 'REDEMPTION',
          amount: reward.pointsCost,
          reason: `Resgate: ${reward.name}`,
          rewardId,
          balanceBefore: account.currentPoints,
          balanceAfter: account.currentPoints - reward.pointsCost,
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
