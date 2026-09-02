// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isPlatformAdminIdentity } from '@/lib/admin/guard';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !isPlatformAdminIdentity(session.user?.role, session.user?.email)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30', 10);

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get all users who signed up in the period
    const users = await prisma.user.findMany({
      where: {
        createdAt: { gte: since },
      },
      select: {
        id: true,
        email: true,
        createdAt: true,
        emailSentDay3: true,
        emailDay3OpenedAt: true,
        emailSentDay7: true,
        emailDay7OpenedAt: true,
        convertedToProAt: true,
        conversionSource: true,
        subscriptionTier: true,
      },
    });

    // Calculate funnel metrics
    const totalSignups = users.length;
    const emailDay3Sent = users.filter((u) => u.emailSentDay3).length;
    const emailDay3Opened = users.filter((u) => u.emailDay3OpenedAt).length;
    const emailDay7Sent = users.filter((u) => u.emailSentDay7).length;
    const emailDay7Opened = users.filter((u) => u.emailDay7OpenedAt).length;
    const converted = users.filter((u) => u.convertedToProAt).length;
    const convertedFromEmail = users.filter(
      (u) => u.convertedToProAt && u.conversionSource === 'email_day7'
    ).length;

    const funnel = [
      {
        stage: 'Signups',
        count: totalSignups,
        percentage: 100,
      },
      {
        stage: 'Day 3 Email Sent',
        count: emailDay3Sent,
        percentage: totalSignups > 0 ? ((emailDay3Sent / totalSignups) * 100).toFixed(1) : 0,
      },
      {
        stage: 'Day 3 Email Opened',
        count: emailDay3Opened,
        percentage: emailDay3Sent > 0 ? ((emailDay3Opened / emailDay3Sent) * 100).toFixed(1) : 0,
      },
      {
        stage: 'Day 7 Email Sent',
        count: emailDay7Sent,
        percentage: totalSignups > 0 ? ((emailDay7Sent / totalSignups) * 100).toFixed(1) : 0,
      },
      {
        stage: 'Day 7 Email Opened',
        count: emailDay7Opened,
        percentage: emailDay7Sent > 0 ? ((emailDay7Opened / emailDay7Sent) * 100).toFixed(1) : 0,
      },
      {
        stage: 'Converted to Paid',
        count: converted,
        percentage: totalSignups > 0 ? ((converted / totalSignups) * 100).toFixed(1) : 0,
      },
    ];

    // Calculate average days to conversion
    const convertedUsers = users.filter((u) => u.convertedToProAt);
    const daysToConversion = convertedUsers.map((u) => {
      const days = Math.floor(
        (u.convertedToProAt!.getTime() - u.createdAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      return days;
    });
    const avgDaysToConversion =
      daysToConversion.length > 0
        ? (daysToConversion.reduce((a, b) => a + b, 0) / daysToConversion.length).toFixed(1)
        : 0;

    // Group by conversion source
    const bySource: { [key: string]: number } = {};
    convertedUsers.forEach((u) => {
      const source = u.conversionSource || 'unknown';
      bySource[source] = (bySource[source] || 0) + 1;
    });

    return NextResponse.json(
      {
        funnel,
        totalSignups,
        totalConverted: converted,
        conversionRate: totalSignups > 0 ? ((converted / totalSignups) * 100).toFixed(2) : '0',
        emailDay7ConversionRate:
          emailDay7Opened > 0 ? ((convertedFromEmail / emailDay7Opened) * 100).toFixed(2) : '0',
        avgDaysToConversion,
        conversionBySource: bySource,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Conversion funnel error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
