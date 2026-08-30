// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/admin-helpers';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/users/stats
 * Estatísticas de usuários
 */
export async function GET(request: NextRequest) {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }

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
