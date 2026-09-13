import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const BUSINESS_STAGES = ['operating', 'opening_soon', 'just_researching'];
const LOCATION_COUNTS = ['1', '2_5', '6_plus'];
const PAIN_POINTS = ['estoque', 'cmv', 'caixa', 'outro'];

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { businessStage, locationCount, mainPainPoint } = await request.json();

  if (
    !BUSINESS_STAGES.includes(businessStage) ||
    !LOCATION_COUNTS.includes(locationCount) ||
    !PAIN_POINTS.includes(mainPainPoint)
  ) {
    return NextResponse.json({ error: 'Resposta inválida' }, { status: 400 });
  }

  const leadQuality = businessStage === 'just_researching' ? 'curious' : 'qualified';

  await prisma.user.update({
    where: { id: session.user.id },
    data: { businessStage, locationCount, mainPainPoint, leadQuality },
  });

  return NextResponse.json({ leadQuality });
}
