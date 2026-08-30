// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { emailType, rating, helpful, comment } = await request.json();

    if (!emailType || !rating) {
      return NextResponse.json(
        { error: 'emailType and rating are required' },
        { status: 400 }
      );
    }

    if (rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: 'rating must be between 1 and 5' },
        { status: 400 }
      );
    }

    // Simple sentiment analysis
    let sentiment = 'neutral';
    if (comment) {
      const positive = ['good', 'great', 'useful', 'helpful', 'excellent', 'perfect', 'amazing'];
      const negative = ['bad', 'poor', 'useless', 'not helpful', 'terrible', 'awful', 'hate'];
      const lowerComment = comment.toLowerCase();

      if (positive.some((word) => lowerComment.includes(word))) {
        sentiment = 'positive';
      } else if (negative.some((word) => lowerComment.includes(word))) {
        sentiment = 'negative';
      }
    }

    const feedback = await prisma.emailFeedback.create({
      data: {
        userId: session.user.id,
        emailType: emailType as any,
        rating,
        helpful,
        comment,
        sentiment,
      },
    });

    return NextResponse.json(feedback, { status: 201 });
  } catch (error) {
    console.error('Error creating feedback:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
