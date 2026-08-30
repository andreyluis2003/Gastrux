// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    const onboarding = await prisma.userOnboarding.update({
      where: { userId },
      data: {
        skippedAt: new Date(),
      },
    });

    return NextResponse.json({
      onboarding,
      message: 'Onboarding pulado. Você pode retomar a qualquer momento nas configurações.',
    });
  } catch (error) {
    console.error('Error skipping onboarding:', error);
    return NextResponse.json(
      { error: 'Erro ao pular onboarding' },
      { status: 500 }
    );
  }
}
