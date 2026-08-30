// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getTierInfo, getNextTierInfo, getProgressToNextTier, getAllTiers } from '@/lib/referral-tiers';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        referralBonusCount: true,
        referralTier: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const currentTierInfo = getTierInfo(user.referralTier);
    const nextTierInfo = getNextTierInfo(user.referralBonusCount);
    const progress = getProgressToNextTier(user.referralBonusCount);
    const allTiers = getAllTiers();

    return NextResponse.json({
      success: true,
      currentTier: user.referralTier,
      currentTierInfo,
      referralCount: user.referralBonusCount,
      nextTier: nextTierInfo,
      progress,
      allTiers,
    });
  } catch (error) {
    console.error('Error getting tier info:', error);
    return NextResponse.json(
      { error: 'Failed to get tier info' },
      { status: 500 }
    );
  }
}
