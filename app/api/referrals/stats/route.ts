// @ts-nocheck
import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        referrals: {
          select: { id: true, email: true, createdAt: true },
        },
        referralHistory: {
          include: {
            user: {
              select: { email: true, name: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      referralCode: user.referralCode || null,
      bonusEarned: user.referralBonusEarned / 100, // Convert to BRL
      bonusCount: user.referralBonusCount,
      referralsCount: user.referrals.length,
      referrals: user.referrals.map((r) => ({
        email: r.email,
        joinedAt: r.createdAt,
      })),
      history: user.referralHistory.map((h) => ({
        email: h.user.email,
        name: h.user.name,
        status: h.status,
        bonusEarned: h.bonusBRL ? h.bonusBRL / 100 : null,
        earnedAt: h.earnedAt,
        createdAt: h.createdAt,
      })),
    });
  } catch (error) {
    console.error('Error fetching referral stats:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
