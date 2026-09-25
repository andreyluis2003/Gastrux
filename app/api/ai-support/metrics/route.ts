// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { computeQualityMetrics, THRESHOLDS } from '@/lib/ai-support/monitoring';
import { isPlatformAdminIdentity } from '@/lib/admin/guard';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isPlatformAdminIdentity(session.user?.role, session.user?.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const hours = Number(url.searchParams.get('hours') || 24);

  const [metrics, alerts, recent] = await Promise.all([
    computeQualityMetrics(hours),
    prisma.aIQualityAlert.findMany({
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
    prisma.aISupportInteraction.findMany({
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true, sessionId: true, userEmail: true, question: true, answer: true,
        rating: true, thumbsUp: true, hallucinationFlag: true, escalatedToHuman: true,
        responseTimeMs: true, createdAt: true, topic: true, feedbackText: true,
      },
    }),
  ]);

  return NextResponse.json({ metrics, alerts, recent, thresholds: THRESHOLDS, windowHours: hours });
}
