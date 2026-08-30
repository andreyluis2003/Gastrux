// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { testId, userId, resultId, eventType } = body; // eventType: open, click, convert

    if (!testId || !userId || !resultId || !eventType) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Find the test result
    const result = await prisma.emailABTestResult.findUnique({
      where: { id: resultId },
    });

    if (!result) {
      return NextResponse.json({ error: 'Result not found' }, { status: 404 });
    }

    // Update based on event type
    let updateData: any = {};
    if (eventType === 'open') {
      updateData.openedAt = new Date();
    } else if (eventType === 'click') {
      updateData.clickedAt = new Date();
    } else if (eventType === 'convert') {
      updateData.convertedAt = new Date();
    }

    // Add event to events array
    const existingEvents = result.events ? JSON.parse(result.events) : [];
    existingEvents.push({
      type: eventType,
      timestamp: new Date().toISOString(),
    });
    updateData.events = JSON.stringify(existingEvents);

    // Update result
    const updatedResult = await prisma.emailABTestResult.update({
      where: { id: resultId },
      data: updateData,
    });

    // Update variant counts based on event type
    const variant = await prisma.emailABVariant.findFirst({
      where: {
        test: { id: testId },
        name: result.variantName,
      },
    });

    if (variant) {
      const incrementData: any = {};
      if (eventType === 'open') {
        incrementData.openCount = 1;
      } else if (eventType === 'click') {
        incrementData.clickCount = 1;
      } else if (eventType === 'convert') {
        incrementData.conversionCount = 1;
      }

      await prisma.emailABVariant.update({
        where: { id: variant.id },
        data: {
          ...Object.fromEntries(
            Object.entries(incrementData).map(([k, v]) => [k, { increment: v }])
          ),
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: `Event '${eventType}' tracked successfully`,
    });
  } catch (error) {
    console.error('Error tracking A/B test event:', error);
    return NextResponse.json(
      { error: 'Failed to track event' },
      { status: 500 }
    );
  }
}
