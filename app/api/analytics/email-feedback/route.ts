// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== 'OWNER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const emailType = searchParams.get('emailType');

    const where: any = {};
    if (emailType) {
      where.emailType = emailType;
    }

    // Get all feedback
    const feedback = await prisma.emailFeedback.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    // Calculate metrics
    const totalFeedback = feedback.length;
    const avgRating =
      totalFeedback > 0 ? (feedback.reduce((sum, f) => sum + f.rating, 0) / totalFeedback).toFixed(2) : 0;

    const helpfulCount = feedback.filter((f) => f.helpful === true).length;
    const notHelpfulCount = feedback.filter((f) => f.helpful === false).length;
    const helpfulRate =
      totalFeedback > 0 ? ((helpfulCount / totalFeedback) * 100).toFixed(2) : '0';

    // Sentiment distribution
    const sentiments: { [key: string]: number } = {};
    feedback.forEach((f) => {
      const sentiment = f.sentiment || 'neutral';
      sentiments[sentiment] = (sentiments[sentiment] || 0) + 1;
    });

    // Rating distribution
    const ratings: { [key: number]: number } = {};
    for (let i = 1; i <= 5; i++) {
      ratings[i] = feedback.filter((f) => f.rating === i).length;
    }

    // Group by email type
    const byEmailType: { [key: string]: any } = {};
    feedback.forEach((f) => {
      const type = f.emailType;
      if (!byEmailType[type]) {
        byEmailType[type] = { type, count: 0, avgRating: 0, helpfulRate: 0 };
      }
      byEmailType[type].count++;
      byEmailType[type].avgRating += f.rating;
    });

    Object.keys(byEmailType).forEach((type) => {
      byEmailType[type].avgRating = (
        byEmailType[type].avgRating / byEmailType[type].count
      ).toFixed(2);
    });

    return NextResponse.json(
      {
        metrics: {
          totalFeedback,
          avgRating,
          helpfulRate,
          helpfulCount,
          notHelpfulCount,
        },
        sentiments,
        ratings,
        byEmailType,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Email feedback analytics error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
