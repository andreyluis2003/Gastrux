// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isPlatformAdminIdentity } from '@/lib/admin/guard';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !isPlatformAdminIdentity((session.user as any)?.role, (session.user as any)?.email)) {
      return NextResponse.json(
        { error: 'Não autorizado' },
        { status: 403 }
      );
    }

    // Buscar warm leads (usuários que disseram que querem falar)
    const leads = await prisma.surveyResponse.findMany({
      where: {
        willingToTalk: true,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
      orderBy: {
        willingnessToPayBRL: 'desc', // Ordenar por maior WTP
      },
    });

    return NextResponse.json(
      { leads },
      { status: 200 }
    );
  } catch (error) {
    console.error('Erro ao buscar warm leads:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar warm leads' },
      { status: 500 }
    );
  }
}
