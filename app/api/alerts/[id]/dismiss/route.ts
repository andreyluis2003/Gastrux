// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  try {
    const alert = await prisma.alert.update({
      where: { id: params.id },
      data: {
        dismissed: true,
        dismissedAt: new Date(),
      },
    });

    return NextResponse.json(alert);
  } catch (error) {
    console.error('Error dismissing alert:', error);
    return NextResponse.json(
      { error: 'Erro ao descartar alerta' },
      { status: 500 }
    );
  }
}
