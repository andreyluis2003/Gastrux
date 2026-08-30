// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const emailType = searchParams.get('emailType');
    const days = parseInt(searchParams.get('days') || '30', 10);

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const where: any = { sentAt: { gte: since } };
    if (emailType) {
      where.emailType = emailType;
    }

    // Get all delivery logs
    const logs = await prisma.emailDeliveryLog.findMany({
      where,
      orderBy: { sentAt: 'desc' },
    });

    // Calculate metrics
    const total = logs.length;
    const delivered = logs.filter((l) => l.status !== 'FAILED' && l.status !== 'BOUNCED').length;
    const opened = logs.filter((l) => l.openedAt).length;
    const clicked = logs.filter((l) => l.clickedAt).length;
    const bounced = logs.filter((l) => l.status === 'BOUNCED').length;

    const metrics = {
      total,
      delivered,
      bounced,
      deliveryRate: total > 0 ? ((delivered / total) * 100).toFixed(2) : '0',
      openRate: total > 0 ? ((opened / total) * 100).toFixed(2) : '0',
      clickRate: total > 0 ? ((clicked / total) * 100).toFixed(2) : '0',
    };

    // Group by date for daily trend
    const dailyTrend: { [key: string]: any } = {};
    logs.forEach((log) => {
      const dateKey = log.sentAt.toISOString().split('T')[0];
      if (!dailyTrend[dateKey]) {
        dailyTrend[dateKey] = { date: dateKey, sent: 0, opened: 0, clicked: 0 };
      }
      dailyTrend[dateKey].sent++;
      if (log.openedAt) dailyTrend[dateKey].opened++;
      if (log.clickedAt) dailyTrend[dateKey].clicked++;
    });

    // Group by variant for A/B analysis
    const byVariant: { [key: string]: any } = {};
    logs.forEach((log) => {
      const variant = log.variant || 'unassigned';
      if (!byVariant[variant]) {
        byVariant[variant] = { variant, sent: 0, opened: 0, openRate: 0 };
      }
      byVariant[variant].sent++;
      if (log.openedAt) byVariant[variant].opened++;
    });

    Object.keys(byVariant).forEach((key) => {
      byVariant[key].openRate = byVariant[key].sent > 0 
        ? ((byVariant[key].opened / byVariant[key].sent) * 100).toFixed(2)
        : '0';
    });

    return NextResponse.json(
      {
        metrics,
        dailyTrend: Object.values(dailyTrend).sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        ),
        byVariant: Object.values(byVariant),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Email analytics error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
