// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { testId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const test = await prisma.emailABTest.findUnique({
      where: { id: params.testId },
      include: {
        variants: true,
        results: {
          select: {
            id: true,
            userId: true,
            variantName: true,
            sentAt: true,
            openedAt: true,
            clickedAt: true,
            convertedAt: true,
          },
          orderBy: {
            sentAt: 'desc',
          },
        },
      },
    });

    if (!test) {
      return NextResponse.json({ error: 'Test not found' }, { status: 404 });
    }

    // Calculate detailed statistics per variant
    const variantStats = test.variants.map((variant) => {
      const variantResults = test.results.filter((r) => r.variantName === variant.name);
      const opens = variantResults.filter((r) => r.openedAt).length;
      const clicks = variantResults.filter((r) => r.clickedAt).length;
      const conversions = variantResults.filter((r) => r.convertedAt).length;

      const openRate = variantResults.length > 0 ? (opens / variantResults.length) * 100 : 0;
      const clickRate = variantResults.length > 0 ? (clicks / variantResults.length) * 100 : 0;
      const conversionRate = variantResults.length > 0 ? (conversions / variantResults.length) * 100 : 0;

      return {
        id: variant.id,
        name: variant.name,
        sentCount: variantResults.length,
        openCount: opens,
        clickCount: clicks,
        conversionCount: conversions,
        openRate: openRate.toFixed(2),
        clickRate: clickRate.toFixed(2),
        conversionRate: conversionRate.toFixed(2),
      };
    });

    return NextResponse.json({
      success: true,
      test: {
        ...test,
        variantStats,
      },
    });
  } catch (error) {
    console.error('Error getting A/B test results:', error);
    return NextResponse.json(
      { error: 'Failed to get A/B test results' },
      { status: 500 }
    );
  }
}
