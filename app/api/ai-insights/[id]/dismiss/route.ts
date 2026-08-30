// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    await prisma.aIInsight.update({
      where: { id: params.id },
      data: { dismissed: true },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[dismiss] Error:', error);
    return NextResponse.json({ error: 'Erro ao dispensar' }, { status: 500 });
  }
}
