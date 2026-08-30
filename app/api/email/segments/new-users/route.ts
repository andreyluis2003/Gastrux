// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/email/segments/new-users
 * Retorna usuários novos:
 * - Cadastrados nos últimos 7 dias
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

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const newUsers = await prisma.user.findMany({
      where: {
        createdAt: { gte: sevenDaysAgo },
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        lastSignInAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      segment: 'new_users',
      count: newUsers.length,
      users: newUsers,
    });
  } catch (error) {
    console.error('Error fetching new users:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch new users' },
      { status: 500 }
    );
  }
}
