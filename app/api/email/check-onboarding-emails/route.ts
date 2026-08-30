// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

interface UserForOnboarding {
  id: string;
  createdAt: Date;
  emailSentDay3: boolean;
  emailSentDay7: boolean;
}

export async function GET(req: NextRequest) {
  try {
    const now = new Date();
    const day3Threshold = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const day7Threshold = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Find users who need Day 3 email (created 3+ days ago and not sent)
    const usersForDay3: UserForOnboarding[] = await prisma.user.findMany({
      where: {
        createdAt: {
          lte: day3Threshold,
        },
        emailSentDay3: false,
        active: true,
      },
      select: {
        id: true,
        createdAt: true,
        emailSentDay3: true,
        emailSentDay7: true,
      },
    });

    // Find users who need Day 7 email (created 7+ days ago and not sent)
    const usersForDay7: UserForOnboarding[] = await prisma.user.findMany({
      where: {
        createdAt: {
          lte: day7Threshold,
        },
        emailSentDay7: false,
        active: true,
      },
      select: {
        id: true,
        createdAt: true,
        emailSentDay3: true,
        emailSentDay7: true,
      },
    });

    return NextResponse.json({
      day3Users: usersForDay3,
      day7Users: usersForDay7,
      summary: {
        day3Count: usersForDay3.length,
        day7Count: usersForDay7.length,
        totalToSend: usersForDay3.length + usersForDay7.length,
      },
    });
  } catch (error) {
    console.error('Error checking onboarding emails:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
