// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isPlatformAdminIdentity } from '@/lib/admin/guard';

export const dynamic = 'force-dynamic';

/**
 * GET /api/email/segments/inactive-users
 * Retorna usuários inativos:
 * - Não fizeram login nos últimos 30 dias
 * - Mas têm conta ativa
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !isPlatformAdminIdentity(session.user.role, session.user.email)) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const inactiveUsers = await prisma.user.findMany({
      where: {
        AND: [
          { active: true },
          {
            OR: [
              { lastSignInAt: { lt: thirtyDaysAgo } }, // Haven't logged in for 30 days
              { lastSignInAt: null }, // Never logged in
            ],
          },
        ],
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        lastSignInAt: true,
      },
      orderBy: { lastSignInAt: 'asc' },
    });

    return NextResponse.json({
      success: true,
      segment: 'inactive_users',
      count: inactiveUsers.length,
      users: inactiveUsers,
    });
  } catch (error) {
    console.error('Error fetching inactive users:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch inactive users' },
      { status: 500 }
    );
  }
}
