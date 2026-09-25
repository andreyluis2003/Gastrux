// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { convertToCSV } from '@/lib/csv-utils';
import { isPlatformAdminIdentity } from '@/lib/admin/guard';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isPlatformAdminIdentity((session.user as any)?.role, session.user?.email)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'csv';

    const logs = await prisma.adminLog.findMany({
      select: {
        id: true,
        userId: true,
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        action: true,
        entityType: true,
        entityId: true,
        ipAddress: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10000,
    });

    // Transformar dados para CSV
    const csvData = logs.map((log) => ({
      'ID do Log': log.id,
      'Data': log.createdAt?.toISOString().split('T')[0] || '-',
      'Hora': log.createdAt?.toISOString().split('T')[1]?.split('.')[0] || '-',
      'Usuário': log.user?.name || 'Sistema',
      'Email': log.user?.email || '-',
      'Ação': log.action,
      'Tipo de Entidade': log.entityType,
      'ID da Entidade': log.entityId,
      'IP': log.ipAddress || '-',
    }));

    const csv = convertToCSV(csvData);

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="logs-auditoria.csv"',
      },
    });
  } catch (error) {
    console.error('[Admin Audit Logs Export] Erro:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
