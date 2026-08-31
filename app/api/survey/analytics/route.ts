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
    // SurveyAnalytics aggregates every user's product-research survey
    // platform-wide - this is Gastrux's own internal data, not something
    // scoped to "the caller's restaurant", so it must be platform-admin only
    // (OWNER/MANAGER are restaurant-scoped roles every paying customer has).
    if (!session?.user || !isPlatformAdminIdentity((session.user as any)?.role, (session.user as any)?.email)) {
      return NextResponse.json(
        { error: 'Não autorizado' },
        { status: 403 }
      );
    }

    // Buscar ou criar analytics
    let analytics = await prisma.surveyAnalytics.findUnique({
      where: { id: 'default' },
    });

    if (!analytics) {
      // Retornar um objeto vazio
      return NextResponse.json({
        totalResponses: 0,
        completionRate: 0,
        averageCompletionTime: 0,
        willingnessDistribution: {},
        medianWtp: 0,
        monetizeableSegment: 0,
        topPainPoints: [],
        topFeatures: [],
        segmentationByUnits: {},
        segmentationByRevenue: {},
        totalWarmLeads: 0,
        contactMethodDistribution: {},
      });
    }

    // Parsear JSON strings
    const parsed = {
      ...analytics,
      willingnessDistribution: JSON.parse(analytics.willingnessDistribution || '{}'),
      topPainPoints: JSON.parse(analytics.topPainPoints || '[]'),
      topFeatures: JSON.parse(analytics.topFeatures || '[]'),
      segmentationByUnits: JSON.parse(analytics.segmentationByUnits || '{}'),
      segmentationByRevenue: JSON.parse(analytics.segmentationByRevenue || '{}'),
      contactMethodDistribution: JSON.parse(analytics.contactMethodDistribution || '{}'),
    };

    return NextResponse.json(parsed, { status: 200 });
  } catch (error) {
    console.error('Erro ao buscar analytics:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar analytics' },
      { status: 500 }
    );
  }
}
