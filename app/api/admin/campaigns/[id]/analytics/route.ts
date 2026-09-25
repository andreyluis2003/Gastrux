// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isPlatformAdminIdentity } from '@/lib/admin/guard';

export const dynamic = 'force-dynamic';

// GET - Fetch analytics by segment for a campaign
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isPlatformAdminIdentity(session.user.role, session.user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get campaign
    const campaign = await prisma.emailCampaign.findUnique({
      where: { id: params.id },
      include: {
        segments: {
          include: {
            performance: {
              include: { variant: true },
            },
          },
        },
        abVariants: true,
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Build analytics response grouped by segment
    const analyticsBySegment = campaign.segments.map((segment) => {
      const segmentPerformance = segment.performance;

      // Calculate aggregates
      const totalSent = segmentPerformance.reduce((sum, p) => sum + p.sentCount, 0);
      const totalOpened = segmentPerformance.reduce((sum, p) => sum + p.openCount, 0);
      const totalClicked = segmentPerformance.reduce((sum, p) => sum + p.clickCount, 0);
      const totalConverted = segmentPerformance.reduce((sum, p) => sum + p.convertCount, 0);

      const openRate = totalSent > 0 ? (totalOpened / totalSent) * 100 : 0;
      const clickRate = totalSent > 0 ? (totalClicked / totalSent) * 100 : 0;
      const conversionRate = totalSent > 0 ? (totalConverted / totalSent) * 100 : 0;

      // Group by variant
      const variantMetrics = campaign.abVariants.map((variant) => {
        const variantPerformance = segmentPerformance.filter(
          (p) => p.variantId === variant.id
        );
        const vSent = variantPerformance.reduce((sum, p) => sum + p.sentCount, 0);
        const vOpened = variantPerformance.reduce((sum, p) => sum + p.openCount, 0);
        const vClicked = variantPerformance.reduce((sum, p) => sum + p.clickCount, 0);
        const vConverted = variantPerformance.reduce((sum, p) => sum + p.convertCount, 0);

        return {
          variantId: variant.id,
          variantName: variant.variantName,
          sentCount: vSent,
          openCount: vOpened,
          clickCount: vClicked,
          convertCount: vConverted,
          openRate: vSent > 0 ? (vOpened / vSent) * 100 : 0,
          clickRate: vSent > 0 ? (vClicked / vSent) * 100 : 0,
          conversionRate: vSent > 0 ? (vConverted / vSent) * 100 : 0,
        };
      });

      return {
        segmentId: segment.id,
        segmentType: segment.segmentType,
        segmentName: segment.segmentName,
        targetUserCount: segment.targetUserCount,
        totalSent,
        totalOpened,
        totalClicked,
        totalConverted,
        openRate: parseFloat(openRate.toFixed(2)),
        clickRate: parseFloat(clickRate.toFixed(2)),
        conversionRate: parseFloat(conversionRate.toFixed(2)),
        variantMetrics,
      };
    });

    // Calculate totals
    const grandTotalSent = analyticsBySegment.reduce((sum, s) => sum + s.totalSent, 0);
    const grandTotalOpened = analyticsBySegment.reduce((sum, s) => sum + s.totalOpened, 0);
    const grandTotalClicked = analyticsBySegment.reduce((sum, s) => sum + s.totalClicked, 0);
    const grandTotalConverted = analyticsBySegment.reduce((sum, s) => sum + s.totalConverted, 0);

    return NextResponse.json(
      {
        campaignId: campaign.id,
        campaignName: campaign.name,
        status: campaign.status,
        totalSent: grandTotalSent,
        totalOpened: grandTotalOpened,
        totalClicked: grandTotalClicked,
        totalConverted: grandTotalConverted,
        overallOpenRate: grandTotalSent > 0 ? parseFloat(((grandTotalOpened / grandTotalSent) * 100).toFixed(2)) : 0,
        overallClickRate: grandTotalSent > 0 ? parseFloat(((grandTotalClicked / grandTotalSent) * 100).toFixed(2)) : 0,
        overallConversionRate: grandTotalSent > 0 ? parseFloat(((grandTotalConverted / grandTotalSent) * 100).toFixed(2)) : 0,
        analyticsBySegment,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}
