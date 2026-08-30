// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

interface TrackingPayload {
  campaignId: string;
  userId: string;
  segmentId: string;
  variantId?: string;
  eventType: 'open' | 'click' | 'convert';
  timestamp?: string;
  metadata?: Record<string, any>;
}

// POST - Track email events (open, click, convert)
export async function POST(req: NextRequest) {
  try {
    const body: TrackingPayload = await req.json();
    const { campaignId, userId, segmentId, variantId, eventType, metadata } = body;

    // Validate required fields
    if (!campaignId || !userId || !segmentId || !eventType) {
      return NextResponse.json(
        { error: 'Missing required fields: campaignId, userId, segmentId, eventType' },
        { status: 400 }
      );
    }

    const validEvents = ['open', 'click', 'convert'];
    if (!validEvents.includes(eventType)) {
      return NextResponse.json(
        { error: `Invalid eventType. Must be one of: ${validEvents.join(', ')}` },
        { status: 400 }
      );
    }

    // Find or create campaign performance record
    let performance = await prisma.campaignPerformance.findFirst({
      where: {
        campaignId,
        segmentId,
        variantId: variantId || null,
      },
    });

    if (!performance) {
      performance = await prisma.campaignPerformance.create({
        data: {
          campaignId,
          segmentId,
          variantId: variantId || null,
        },
      });
    }

    // Update performance metrics based on event type
    const updateData: any = {};

    switch (eventType) {
      case 'open':
        updateData.openCount = { increment: 1 };
        updateData.firstOpenAt = performance.firstOpenAt || new Date();
        updateData.lastOpenAt = new Date();
        break;

      case 'click':
        updateData.clickCount = { increment: 1 };
        updateData.firstClickAt = performance.firstClickAt || new Date();
        break;

      case 'convert':
        updateData.convertCount = { increment: 1 };
        break;
    }

    // Calculate rates
    const sentCount = performance.sentCount || 1; // Avoid division by zero
    const updatedPerformance = await prisma.campaignPerformance.update({
      where: { id: performance.id },
      data: {
        ...updateData,
        openRate: performance.sentCount > 0
          ? ((performance.openCount + (eventType === 'open' ? 1 : 0)) / sentCount) * 100
          : 0,
        clickRate: performance.sentCount > 0
          ? ((performance.clickCount + (eventType === 'click' ? 1 : 0)) / sentCount) * 100
          : 0,
        conversionRate: performance.sentCount > 0
          ? ((performance.convertCount + (eventType === 'convert' ? 1 : 0)) / sentCount) * 100
          : 0,
      },
    });

    // Also update variant metrics
    if (variantId) {
      const variantUpdate: any = {};

      switch (eventType) {
        case 'open':
          variantUpdate.openCount = { increment: 1 };
          break;
        case 'click':
          variantUpdate.clickCount = { increment: 1 };
          break;
        case 'convert':
          variantUpdate.convertCount = { increment: 1 };
          break;
      }

      await prisma.campaignABVariant.update({
        where: { id: variantId },
        data: variantUpdate,
      });
    }

    // Update campaign totals
    const campaignUpdate: any = {};
    switch (eventType) {
      case 'open':
        campaignUpdate.totalOpened = { increment: 1 };
        break;
      case 'click':
        campaignUpdate.totalClicked = { increment: 1 };
        break;
      case 'convert':
        campaignUpdate.totalConverted = { increment: 1 };
        break;
    }

    await prisma.emailCampaign.update({
      where: { id: campaignId },
      data: campaignUpdate,
    });

    // Log the event in EmailDeliveryLog for future reference
    try {
      const statusMap: Record<string, any> = {
        open: 'OPENED',
        click: 'CLICKED',
        convert: 'SENT',
      };

      await prisma.emailDeliveryLog.create({
        data: {
          userId,
          emailType: 'other',
          variant: variantId || 'A',
          status: statusMap[eventType] || 'SENT',
          openedAt: eventType === 'open' ? new Date() : undefined,
          clickedAt: eventType === 'click' ? new Date() : undefined,
        },
      });
    } catch {
      // Ignore logging errors
      console.log(`Could not log tracking event for ${userId}`);
    }

    return NextResponse.json(
      {
        success: true,
        eventType,
        campaignId,
        segmentId,
        userId,
        performance: updatedPerformance,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Tracking error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Tracking failed' },
      { status: 500 }
    );
  }
}

// GET - Retrieve tracking summary for a campaign
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get('campaignId');

    if (!campaignId) {
      return NextResponse.json(
        { error: 'campaignId query param required' },
        { status: 400 }
      );
    }

    const deliveryLogs = await prisma.emailDeliveryLog.findMany({
      where: { emailType: 'other' },
      select: {
        id: true,
        emailType: true,
        status: true,
        sentAt: true,
        openedAt: true,
        clickedAt: true,
      },
      take: 1000,
    });

    // Count events by type
    const events = {
      sent: deliveryLogs.filter((log) => !log.openedAt && !log.clickedAt).length,
      opens: deliveryLogs.filter((log) => log.openedAt).length,
      clicks: deliveryLogs.filter((log) => log.clickedAt).length,
      conversions: 0, // Would need separate conversion tracking table
    };

    return NextResponse.json(
      {
        campaignId,
        events,
        totalLogs: deliveryLogs.length,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error retrieving tracking data:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve tracking data' },
      { status: 500 }
    );
  }
}
