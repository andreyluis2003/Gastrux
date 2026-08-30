// @ts-nocheck
import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getTierByReferralCount, getBonusByTier, formatBonus } from '@/lib/referral-tiers';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { referralCode } = await req.json();

    if (!referralCode || typeof referralCode !== 'string') {
      return NextResponse.json({ error: 'Invalid referral code' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.referredByUserId) {
      return NextResponse.json(
        { error: 'You have already redeemed a referral code' },
        { status: 400 }
      );
    }

    const referrer = await prisma.user.findUnique({
      where: { referralCode },
    });

    if (!referrer) {
      return NextResponse.json({ error: 'Invalid referral code' }, { status: 404 });
    }

    if (referrer.id === user.id) {
      return NextResponse.json(
        { error: 'Cannot use your own referral code' },
        { status: 400 }
      );
    }

    // Calculate bonus based on referrer's new tier (after this referral)
    const referrerNewCount = referrer.referralBonusCount + 1;
    const newTier = getTierByReferralCount(referrerNewCount);
    const bonusAmount = getBonusByTier(newTier);

    // Update both users and create referral history
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { referredByUserId: referrer.id },
      }),
      prisma.user.update({
        where: { id: referrer.id },
        data: {
          referralBonusEarned: { increment: bonusAmount },
          referralBonusCount: { increment: 1 },
          referralTier: newTier,
        },
      }),
      prisma.referralHistory.create({
        data: {
          userId: user.id,
          referrerUserId: referrer.id,
          referralCode: referralCode,
          status: 'completed',
          bonusBRL: bonusAmount,
          earnedAt: new Date(),
        },
      }),
    ]);

    const bonusFormatted = formatBonus(bonusAmount);

    return NextResponse.json({
      success: true,
      message: `Code redeemed! Your friend earned ${bonusFormatted} and advanced to ${newTier.toUpperCase()} tier!`,
      bonusEarned: bonusAmount / 100,
      referrerTier: newTier,
      bonusFormatted,
    });
  } catch (error) {
    console.error('Error redeeming referral code:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
