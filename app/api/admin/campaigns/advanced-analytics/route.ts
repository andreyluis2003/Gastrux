// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  chiSquareTest,
  calculateMinSampleSize,
  generateCampaignRecommendations,
  predictPerformance,
} from '@/lib/campaign-analytics';

export const dynamic = 'force-dynamic';

// GET - Advanced analytics for a campaign
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get('campaignId');

    if (!campaignId) {
      return NextResponse.json(
        { error: 'campaignId query param required' },
        { status: 400 }
      );
    }

    // Fetch campaign with all related data
    const campaign = await prisma.emailCampaign.findUnique({
      where: { id: campaignId },
      include: {
        segments: {
          include: {
            performance: {
              include: { variant: true },
            },
          },
        },
        abVariants: true,
        performance: true,
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Chi-square test for A/B variants
    let abTestResult = null;
    if (campaign.abVariants.length === 2) {
      const variantA = campaign.abVariants[0];
      const variantB = campaign.abVariants[1];

      if (variantA.sentCount > 0 && variantB.sentCount > 0) {
        abTestResult = chiSquareTest(
          {
            name: `Variante ${variantA.variantName}`,
            successes: variantA.openCount,
            total: variantA.sentCount,
          },
          {
            name: `Variante ${variantB.variantName}`,
            successes: variantB.openCount,
            total: variantB.sentCount,
          }
        );
      }
    }

    // Calculate recommended sample size
    const baselineOpenRate = campaign.totalSent > 0
      ? campaign.totalOpened / campaign.totalSent
      : 0.3; // Default assumption if no data

    const sampleSizeRec = calculateMinSampleSize(baselineOpenRate);

    // Build campaign data for recommendations
    const campaignData = {
      totalSent: campaign.totalSent,
      totalOpened: campaign.totalOpened,
      totalClicked: campaign.totalClicked,
      totalConverted: campaign.totalConverted,
      segments: campaign.segments.map((s) => ({
        segmentName: s.segmentName,
        sentCount: s.sentCount,
        openRate: s.performance.reduce((sum, p) => sum + p.openRate, 0) / (s.performance.length || 1),
        clickRate: s.performance.reduce((sum, p) => sum + p.clickRate, 0) / (s.performance.length || 1),
        conversionRate: s.performance.reduce((sum, p) => sum + p.conversionRate, 0) / (s.performance.length || 1),
      })),
      variants: campaign.abVariants.map((v) => ({
        variantName: v.variantName,
        sentCount: v.sentCount,
        openRate: v.sentCount > 0 ? (v.openCount / v.sentCount) * 100 : 0,
        clickRate: v.sentCount > 0 ? (v.clickCount / v.sentCount) * 100 : 0,
      })),
    };

    // Generate recommendations
    const recommendations = generateCampaignRecommendations(campaignData);

    // Fetch historical campaigns for prediction
    const historicalCampaigns = await prisma.emailCampaign.findMany({
      where: {
        id: { not: campaignId },
        status: { in: ['completed', 'active'] },
        totalSent: { gt: 0 },
      },
      select: {
        totalSent: true,
        totalOpened: true,
        totalClicked: true,
        totalConverted: true,
      },
      take: 10,
    });

    const historicalData = historicalCampaigns.map((c) => ({
      openRate: c.totalSent > 0 ? (c.totalOpened / c.totalSent) * 100 : 0,
      clickRate: c.totalSent > 0 ? (c.totalClicked / c.totalSent) * 100 : 0,
      conversionRate: c.totalSent > 0 ? (c.totalConverted / c.totalSent) * 100 : 0,
    }));

    const prediction = predictPerformance(historicalData, {
      sent: campaign.totalSent,
      opened: campaign.totalOpened,
      clicked: campaign.totalClicked,
    });

    return NextResponse.json(
      {
        campaignId: campaign.id,
        campaignName: campaign.name,
        abTestResult,
        sampleSizeRecommendation: sampleSizeRec,
        recommendations,
        performancePrediction: prediction,
        campaignMetrics: {
          totalSent: campaign.totalSent,
          totalOpened: campaign.totalOpened,
          totalClicked: campaign.totalClicked,
          totalConverted: campaign.totalConverted,
          openRate: campaign.totalSent > 0 
            ? parseFloat(((campaign.totalOpened / campaign.totalSent) * 100).toFixed(2))
            : 0,
          clickRate: campaign.totalSent > 0
            ? parseFloat(((campaign.totalClicked / campaign.totalSent) * 100).toFixed(2))
            : 0,
          conversionRate: campaign.totalSent > 0
            ? parseFloat(((campaign.totalConverted / campaign.totalSent) * 100).toFixed(2))
            : 0,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Advanced analytics error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to generate analytics',
      },
      { status: 500 }
    );
  }
}
