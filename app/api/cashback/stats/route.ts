// Cashback stats endpoint for admin dashboard
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accounts = await prisma.customerLoyaltyAccount.findMany({
      where: { active: true },
      select: { currentPoints: true, totalPointsEarned: true, totalPointsRedeemed: true },
    });

    const recentTransactions = await prisma.loyaltyTransaction.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { type: true, amount: true, reason: true, createdAt: true },
    });

    return NextResponse.json({
      totalAccounts: accounts.length,
      totalPointsIssued: accounts.reduce((sum, a) => sum + a.totalPointsEarned, 0),
      totalPointsRedeemed: accounts.reduce((sum, a) => sum + a.totalPointsRedeemed, 0),
      totalPointsActive: accounts.reduce((sum, a) => sum + a.currentPoints, 0),
      recentTransactions,
    });
  } catch (error) {
    console.error('Error fetching cashback stats:', error);
    return NextResponse.json({
      totalAccounts: 0,
      totalPointsIssued: 0,
      totalPointsRedeemed: 0,
      totalPointsActive: 0,
      recentTransactions: [],
    });
  }
}
