// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Helper: count active users matching a segment type (mirrors execute route logic)
async function countSegmentUsers(segmentType: string, filter: any): Promise<number> {
  const query: any = { active: true };
  const now = Date.now();
  switch (segmentType) {
    case 'early_adopters':
      query.createdAt = { lte: new Date(now - 30 * 24 * 60 * 60 * 1000) };
      query.lastSignInAt = { gte: new Date(now - 7 * 24 * 60 * 60 * 1000) };
      break;
    case 'inactive_users':
      query.OR = [
        { lastSignInAt: null },
        { lastSignInAt: { lt: new Date(now - 30 * 24 * 60 * 60 * 1000) } },
      ];
      break;
    case 'new_users':
      query.createdAt = { gte: new Date(now - 7 * 24 * 60 * 60 * 1000) };
      break;
    case 'custom':
      if (filter?.role) query.role = filter.role;
      if (filter?.subscriptionStatus) query.subscriptionStatus = filter.subscriptionStatus;
      break;
    case 'all_users':
      break;
    default:
      return 0;
  }
  try {
    return await prisma.user.count({ where: query });
  } catch {
    return 0;
  }
}

// GET - List all campaigns
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== 'OWNER' && session.user.role !== 'MANAGER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const campaigns = await prisma.emailCampaign.findMany({
      include: {
        segments: {
          select: {
            id: true,
            segmentType: true,
            segmentName: true,
            targetUserCount: true,
            sentCount: true,
            openCount: true,
            clickCount: true,
          },
        },
        abVariants: {
          select: {
            id: true,
            variantName: true,
            sentCount: true,
            openCount: true,
            clickCount: true,
          },
        },
        schedules: {
          select: {
            id: true,
            scheduleType: true,
            scheduledAt: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Recompute live target counts so segments always reflect current audience
    const campaignsWithCounts = await Promise.all(
      campaigns.map(async (c: any) => ({
        ...c,
        segments: await Promise.all(
          (c.segments || []).map(async (s: any) => ({
            ...s,
            targetUserCount: await countSegmentUsers(
              s.segmentType,
              s.customFilter ? (() => { try { return JSON.parse(s.customFilter); } catch { return null; } })() : null,
            ),
          })),
        ),
      })),
    );

    return NextResponse.json(campaignsWithCounts, { status: 200 });
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    return NextResponse.json(
      { error: 'Failed to fetch campaigns' },
      { status: 500 }
    );
  }
}

// POST - Create a new campaign
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== 'OWNER' && session.user.role !== 'MANAGER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const {
      name,
      description,
      type,
      subjectLine,
      preheader,
      content,
      segments,
      enableABTest,
      abTestingMetric,
    } = body;

    if (!name || !type || !subjectLine || !content || !segments || segments.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Compute target user count for each segment so it displays correctly
    const segmentsWithCounts = await Promise.all(
      segments.map(async (segment: any) => {
        const filter = segment.customFilter
          ? (typeof segment.customFilter === 'string' ? JSON.parse(segment.customFilter) : segment.customFilter)
          : null;
        const targetUserCount = await countSegmentUsers(segment.segmentType, filter);
        return {
          segmentType: segment.segmentType,
          segmentName: segment.segmentName,
          customFilter: segment.customFilter || null,
          targetUserCount,
          aVariantPercentage: segment.aVariantPercentage || 50,
          bVariantPercentage: segment.bVariantPercentage || 50,
        };
      })
    );

    const campaign = await prisma.emailCampaign.create({
      data: {
        name,
        description: description || null,
        type,
        subjectLine,
        preheader: preheader || null,
        content,
        createdBy: session.user.id,
        enableABTest: enableABTest || false,
        abTestingMetric: abTestingMetric || 'open_rate',
        segments: {
          create: segmentsWithCounts,
        },
      },
      include: {
        segments: true,
        abVariants: true,
      },
    });

    return NextResponse.json(campaign, { status: 201 });
  } catch (error) {
    console.error('Error creating campaign:', error);
    return NextResponse.json(
      { error: 'Failed to create campaign' },
      { status: 500 }
    );
  }
}
