// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tests = await prisma.emailABTest.findMany({
      include: {
        variants: {
          select: {
            id: true,
            name: true,
            percentage: true,
            sentCount: true,
            openCount: true,
            clickCount: true,
            conversionCount: true,
          },
        },
        _count: {
          select: {
            results: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Calculate metrics for each test
    const testsWithMetrics = tests.map((test) => {
      const totalSent = test.variants.reduce((sum, v) => sum + v.sentCount, 0);
      const totalOpens = test.variants.reduce((sum, v) => sum + v.openCount, 0);
      const totalClicks = test.variants.reduce((sum, v) => sum + v.clickCount, 0);
      const totalConversions = test.variants.reduce((sum, v) => sum + v.conversionCount, 0);

      return {
        ...test,
        metrics: {
          totalSent,
          totalOpens,
          totalClicks,
          totalConversions,
          openRate: totalSent > 0 ? ((totalOpens / totalSent) * 100).toFixed(2) : '0',
          clickRate: totalSent > 0 ? ((totalClicks / totalSent) * 100).toFixed(2) : '0',
          conversionRate: totalSent > 0 ? ((totalConversions / totalSent) * 100).toFixed(2) : '0',
        },
      };
    });

    return NextResponse.json({
      success: true,
      tests: testsWithMetrics,
    });
  } catch (error) {
    console.error('Error listing A/B tests:', error);
    return NextResponse.json(
      { error: 'Failed to list A/B tests' },
      { status: 500 }
    );
  }
}
