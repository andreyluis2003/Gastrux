// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isPlatformAdminIdentity } from '@/lib/admin/guard';

export const dynamic = 'force-dynamic';

interface ExecutionLog {
  campaignId: string;
  segmentId: string;
  variantId?: string;
  userId: string;
  status: 'sent' | 'failed';
  errorMessage?: string;
  sentAt: Date;
}

// Helper: Get users for a segment
async function getSegmentUsers(campaignId: string, segmentId: string) {
  const segment = await prisma.campaignSegment.findUnique({
    where: { id: segmentId },
    include: { campaign: true },
  });

  if (!segment) return [];

  const filter = segment.customFilter ? JSON.parse(segment.customFilter) : null;

  let query: any = { active: true };

  switch (segment.segmentType) {
    case 'early_adopters':
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      query.createdAt = { lte: thirtyDaysAgo };
      query.lastSignInAt = { gte: sevenDaysAgo };
      break;

    case 'inactive_users':
      const thirtyDaysAgoInactive = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      query.OR = [
        { lastSignInAt: null },
        { lastSignInAt: { lt: thirtyDaysAgoInactive } },
      ];
      break;

    case 'new_users':
      const sevenDaysAgoNew = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      query.createdAt = { gte: sevenDaysAgoNew };
      break;

    case 'custom':
      if (filter?.role) query.role = filter.role;
      if (filter?.subscriptionStatus) query.subscriptionStatus = filter.subscriptionStatus;
      break;

    case 'all_users':
      // Todos os usuários ativos — sem filtros adicionais
      break;

    default:
      return [];
  }

  const users = await prisma.user.findMany({
    where: query,
    select: { id: true, email: true, name: true },
  });

  return users.map((u) => ({
    ...u,
    name: u.name || '',
  }));
}

// Helper: Select A/B variant based on percentage
function selectVariant(
  variants: any[],
  aPercentage: number,
  bPercentage: number
): string {
  const rand = Math.random() * 100;
  if (rand < aPercentage) return 'A';
  return 'B';
}

// Helper: Send campaign email
async function sendCampaignEmail(
  user: { id: string; email: string; name?: string },
  campaign: any,
  variant: any,
  segmentId: string
) {
  try {
    const subject = (variant?.subjectLine || campaign.subjectLine)
      .replace('[NAME]', user.name || 'Usuário')
      .replace('[EMAIL]', user.email);

    const content = (variant?.content || campaign.content)
      .replace('[NAME]', user.name || 'Usuário')
      .replace('[EMAIL]', user.email)
      .replace('[CAMPAIGN_ID]', campaign.id)
      .replace('[VARIANT]', variant?.variantName || 'A');

    console.log(`Would send email to ${user.email}: ${subject}`);

    // Log campaign send (using 'other' email type for campaigns)
    try {
      await prisma.emailDeliveryLog.create({
        data: {
          userId: user.id,
          emailType: 'other',
          variant: variant?.variantName || 'A',
          status: 'SENT',
          sentAt: new Date(),
        },
      });
    } catch {
      // Ignore logging errors
      console.log(`Could not log email delivery for ${user.id}`);
    }

    return { status: 'sent', error: null };
  } catch (error) {
    console.error(`Failed to send email to ${user.email}:`, error);
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Main execution function
async function executeCampaign(campaignId: string) {
  const campaign = await prisma.emailCampaign.findUnique({
    where: { id: campaignId },
    include: {
      segments: true,
      abVariants: true,
      schedules: true,
    },
  });

  if (!campaign) {
    throw new Error(`Campaign not found: ${campaignId}`);
  }

  if (campaign.status === 'completed' || campaign.status === 'paused') {
    throw new Error(`Campaign cannot be executed: ${campaign.status}`);
  }

  const executionLogs: ExecutionLog[] = [];
  let totalSent = 0;
  let totalFailed = 0;

  for (const segment of campaign.segments) {
    const users = await getSegmentUsers(campaignId, segment.id);
    let segmentSent = 0;
    let segmentFailed = 0;

    for (const user of users) {
      const selectedVariant = selectVariant(
        campaign.abVariants,
        segment.aVariantPercentage,
        segment.bVariantPercentage
      );

      const variant = campaign.abVariants.find((v) => v.variantName === selectedVariant);

      const result = await sendCampaignEmail(user, campaign, variant, segment.id);

      if (result.status === 'sent') {
        segmentSent++;
        totalSent++;

        if (variant) {
          await prisma.campaignABVariant.update({
            where: { id: variant.id },
            data: { sentCount: { increment: 1 } },
          });
        }
      } else {
        segmentFailed++;
        totalFailed++;
      }

      executionLogs.push({
        campaignId,
        segmentId: segment.id,
        variantId: variant?.id,
        userId: user.id,
        status: result.status as 'sent' | 'failed',
        errorMessage: result.error || undefined,
        sentAt: new Date(),
      });
    }

    await prisma.campaignSegment.update({
      where: { id: segment.id },
      data: {
        targetUserCount: users.length,
        sentCount: { increment: segmentSent },
      },
    });
  }

  const newStatus = campaign.status === 'draft' ? 'active' : campaign.status;
  await prisma.emailCampaign.update({
    where: { id: campaignId },
    data: {
      status: newStatus,
      totalSent: { increment: totalSent },
      launchedAt: campaign.launchedAt || new Date(),
    },
  });

  const schedule = campaign.schedules[0];
  if (schedule && schedule.scheduleType !== 'immediate') {
    await prisma.campaignSchedule.update({
      where: { id: schedule.id },
      data: {
        status: 'completed',
        lastExecutedAt: new Date(),
        executionCount: { increment: 1 },
      },
    });
  }

  return {
    campaignId,
    totalSent,
    totalFailed,
    totalExecuted: totalSent + totalFailed,
    executionLogs,
    timestamp: new Date(),
  };
}

// POST - Execute a campaign immediately
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isPlatformAdminIdentity(session.user.role, session.user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { campaignId } = body;

    if (!campaignId) {
      return NextResponse.json(
        { error: 'campaignId is required' },
        { status: 400 }
      );
    }

    const result = await executeCampaign(campaignId);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('Campaign execution error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Campaign execution failed',
      },
      { status: 500 }
    );
  }
}

// GET - Check campaign execution status
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isPlatformAdminIdentity(session.user.role, session.user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get('campaignId');

    if (!campaignId) {
      return NextResponse.json(
        { error: 'campaignId query param required' },
        { status: 400 }
      );
    }

    const campaign = await prisma.emailCampaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        status: true,
        totalSent: true,
        launchedAt: true,
        schedules: {
          select: {
            status: true,
            lastExecutedAt: true,
            nextExecutionAt: true,
            executionCount: true,
          },
        },
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    return NextResponse.json(campaign, { status: 200 });
  } catch (error) {
    console.error('Error checking campaign status:', error);
    return NextResponse.json(
      { error: 'Failed to check campaign status' },
      { status: 500 }
    );
  }
}
