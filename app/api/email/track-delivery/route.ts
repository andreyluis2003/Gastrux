// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const { userId, emailType, event, variant } = await request.json();

    if (!userId || !emailType || !event) {
      return NextResponse.json(
        { error: 'userId, emailType, and event are required' },
        { status: 400 }
      );
    }

    // Create or update delivery log
    let deliveryLog = await prisma.emailDeliveryLog.findFirst({
      where: {
        userId,
        emailType: emailType as any,
        sentAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
      orderBy: { sentAt: 'desc' },
    });

    if (!deliveryLog) {
      deliveryLog = await prisma.emailDeliveryLog.create({
        data: {
          userId,
          emailType: emailType as any,
          variant,
          status: 'SENT',
        },
      });
    }

    // Update based on event type
    const updateData: any = {};

    if (event === 'delivered') {
      updateData.status = 'DELIVERED';
    } else if (event === 'opened') {
      updateData.status = 'OPENED';
      updateData.openedAt = new Date();
    } else if (event === 'clicked') {
      updateData.status = 'CLICKED';
      updateData.clickedAt = new Date();
    } else if (event === 'bounced') {
      updateData.status = 'BOUNCED';
    }

    const updated = await prisma.emailDeliveryLog.update({
      where: { id: deliveryLog.id },
      data: updateData,
    });

    // Update user tracking fields if needed
    if (event === 'opened') {
      if (emailType === 'day3') {
        await prisma.user.update({
          where: { id: userId },
          data: { emailDay3OpenedAt: new Date() },
        });
      } else if (emailType === 'day7') {
        await prisma.user.update({
          where: { id: userId },
          data: { emailDay7OpenedAt: new Date() },
        });
      }
    }

    return NextResponse.json({ success: true, deliveryLog: updated }, { status: 200 });
  } catch (error) {
    console.error('Email tracking error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
