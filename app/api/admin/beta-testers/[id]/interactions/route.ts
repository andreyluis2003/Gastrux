// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !['ADMIN'].includes(session.user?.role as string)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { type, title, notes, rating } = body;

    if (!type || !title || !notes) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const interaction = await prisma.betaTesterInteraction.create({
      data: {
        betaTesterId: params.id,
        type,
        title,
        notes,
        rating,
      },
    });

    await prisma.betaTester.update({
      where: { id: params.id },
      data: {
        lastInteractionAt: new Date(),
        weeklyMeetings: type === 'weekly_meeting' ? { increment: 1 } : undefined,
      },
    });

    return NextResponse.json(interaction, { status: 201 });
  } catch (error) {
    console.error('Error creating interaction:', error);
    return NextResponse.json(
      { error: 'Failed to create interaction' },
      { status: 500 }
    );
  }
}
