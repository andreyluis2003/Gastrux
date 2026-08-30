// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/email/segments/early-adopters
 * Retorna usuários early adopters:
 * - Cadastrados há mais de 30 dias
 * - Fizeram login nos últimos 7 dias
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'OWNER') {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const earlyAdopters = await prisma.user.findMany({
      where: {
        AND: [
          { createdAt: { lt: thirtyDaysAgo } }, // Created more than 30 days ago
          { lastSignInAt: { gte: sevenDaysAgo } }, // Logged in within 7 days
        ],
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        lastSignInAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({
      success: true,
      segment: 'early_adopters',
      count: earlyAdopters.length,
      users: earlyAdopters,
    });
  } catch (error) {
    console.error('Error fetching early adopters:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch early adopters' },
      { status: 500 }
    );
  }
}
