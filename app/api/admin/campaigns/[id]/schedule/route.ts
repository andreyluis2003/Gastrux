// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET - Fetch schedule for a campaign
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const schedules = await prisma.campaignSchedule.findMany({
      where: { campaignId: params.id },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(schedules, { status: 200 });
  } catch (error) {
    console.error('Error fetching schedules:', error);
    return NextResponse.json(
      { error: 'Failed to fetch schedules' },
      { status: 500 }
    );
  }
}

// POST - Create or update schedule
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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
      scheduleType,
      scheduledAt,
      sendTime,
      recurringPattern,
      recurringStartDate,
      recurringEndDate,
    } = body;

    if (!scheduleType) {
      return NextResponse.json(
        { error: 'Missing scheduleType' },
        { status: 400 }
      );
    }

    // Delete existing schedules for this campaign
    await prisma.campaignSchedule.deleteMany({
      where: { campaignId: params.id },
    });

    const schedule = await prisma.campaignSchedule.create({
      data: {
        campaignId: params.id,
        scheduleType,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        sendTime: sendTime || '08:00',
        recurringPattern: recurringPattern ? JSON.stringify(recurringPattern) : null,
        recurringStartDate: recurringStartDate ? new Date(recurringStartDate) : null,
        recurringEndDate: recurringEndDate ? new Date(recurringEndDate) : null,
        status: 'pending',
        nextExecutionAt: scheduledAt ? new Date(scheduledAt) : null,
      },
    });

    return NextResponse.json(schedule, { status: 201 });
  } catch (error) {
    console.error('Error creating schedule:', error);
    return NextResponse.json(
      { error: 'Failed to create schedule' },
      { status: 500 }
    );
  }
}
