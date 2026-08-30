// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/admin-helpers';
import { prisma } from '@/lib/prisma';
import { convertToCSV } from '@/lib/csv-utils';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'csv';

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
        updatedAt: true,
        staffMember: {
          select: {
            cpf: true,
            phone: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Transformar dados para CSV
    const csvData = users.map((user) => ({
      'ID': user.id,
      'Nome': user.name,
      'Email': user.email,
      'Função': user.role,
      'Status': user.active ? 'Ativo' : 'Inativo',
      'CPF': user.staffMember?.cpf || '-',
      'Telefone': user.staffMember?.phone || '-',
      'Criado em': user.createdAt?.toISOString().split('T')[0] || '-',
      'Atualizado em': user.updatedAt?.toISOString().split('T')[0] || '-',
    }));

    const csv = convertToCSV(csvData);

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="usuarios.csv"',
      },
    });
  } catch (error) {
    console.error('[Admin Users Export] Erro:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
