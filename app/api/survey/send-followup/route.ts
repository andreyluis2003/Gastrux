// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Não autorizado' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email || '' },
    });

    if (!user || !['OWNER', 'MANAGER'].includes(user.role)) {
      return NextResponse.json(
        { error: 'Não autorizado' },
        { status: 403 }
      );
    }

    const data = await req.json();
    const { surveyResponseId } = data;

    if (!surveyResponseId) {
      return NextResponse.json(
        { error: 'ID da resposta obrigatório' },
        { status: 400 }
      );
    }

    // Atualizar survey response marcando follow-up como enviado
    const updatedResponse = await prisma.surveyResponse.update({
      where: { id: surveyResponseId },
      data: {
        followUpSentAt: new Date(),
      },
      include: {
        user: {
          select: {
            email: true,
            name: true,
          },
        },
      },
    });

    // Aqui você poderia integrar com um serviço de email
    // Por enquanto, apenas marcamos como enviado no banco
    console.log(`Follow-up marcado como enviado para ${updatedResponse.user.email}`);

    return NextResponse.json(
      {
        success: true,
        message: 'Follow-up marcado como enviado',
        data: updatedResponse,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Erro ao enviar follow-up:', error);
    return NextResponse.json(
      { error: 'Erro ao enviar follow-up' },
      { status: 500 }
    );
  }
}
