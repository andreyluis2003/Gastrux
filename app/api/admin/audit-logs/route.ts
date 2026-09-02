// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { AdminAction } from '@prisma/client';
import { isPlatformAdminIdentity } from '@/lib/admin/guard';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/audit-logs
 * Lista logs de auditoria com filtros e paginação
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isPlatformAdminIdentity((session.user as any)?.role, session.user?.email)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const userId = searchParams.get('userId');
    const action = searchParams.get('action') as AdminAction | null;
    const entityType = searchParams.get('entityType');
    const entityId = searchParams.get('entityId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const search = searchParams.get('search');

    const where: any = {};

    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    if (search) {
      where.OR = [
        { entityName: { contains: search, mode: 'insensitive' } },
        { entityId: { contains: search, mode: 'insensitive' } },
        { user: { name: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [logs, total] = await Promise.all([
      prisma.adminLog.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.adminLog.count({ where }),
    ]);

    return NextResponse.json({
      logs: logs.map((log) => ({
        id: log.id,
        user: log.user,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        entityName: log.entityName,
        changesBefore: log.changesBefore ? JSON.parse(log.changesBefore) : null,
        changesAfter: log.changesAfter ? JSON.parse(log.changesAfter) : null,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        financialImpact: log.financialImpact ? Number(log.financialImpact) : null,
        createdAt: log.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('[Admin Audit Logs] Erro:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
