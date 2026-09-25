// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isPlatformAdminIdentity } from '@/lib/admin/guard';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/users/stats
 * Estatísticas de usuários
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isPlatformAdminIdentity((session.user as any)?.role, session.user?.email)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
  }

  try {
    const [totalUsers, byRole, byStatus, recentSignups, staffStats] = await Promise.all([
      prisma.user.count(),
      prisma.user.groupBy({
        by: ['role'],
        _count: { id: true },
      }),
      prisma.user.groupBy({
        by: ['active'],
        _count: { id: true },
      }),
      prisma.user.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      prisma.staffMember.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
    ]);

    return NextResponse.json({
      totalUsers,
      byRole: byRole.map((r) => ({ role: r.role, count: r._count.id })),
      byStatus: byStatus.map((s) => ({ active: s.active, count: s._count.id })),
      recentSignups,
      staffStats: staffStats.map((s) => ({ status: s.status, count: s._count.id })),
    });
  } catch (error) {
    console.error('[Admin Users Stats] Erro:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
