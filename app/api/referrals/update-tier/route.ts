// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getTierByReferralCount } from '@/lib/referral-tiers';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        referralBonusCount: true,
        referralTier: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Calculate new tier based on referral count
    const newTier = getTierByReferralCount(user.referralBonusCount);

    // Update tier if it changed
    if (newTier !== user.referralTier) {
      await prisma.user.update({
        where: { id: user.id },
        data: { referralTier: newTier },
      });
    }

    return NextResponse.json({
      success: true,
      tier: newTier,
      referralCount: user.referralBonusCount,
    });
  } catch (error) {
    console.error('Error updating referral tier:', error);
    return NextResponse.json(
      { error: 'Failed to update tier' },
      { status: 500 }
    );
  }
}
