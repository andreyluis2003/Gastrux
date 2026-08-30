// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !['ADMIN'].includes(session.user?.role as string)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const contactId = searchParams.get('contactId');

    const communications = await prisma.partnershipCommunication.findMany({
      where: contactId ? { contactId } : {},
      include: { contact: true },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(communications);
  } catch (error) {
    console.error('Error fetching communications:', error);
    return NextResponse.json(
      { error: 'Failed to fetch communications' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !['ADMIN'].includes(session.user?.role as string)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { contactId, type, subject, message, outcome } = body;

    if (!contactId || !type || !message) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const communication = await prisma.partnershipCommunication.create({
      data: {
        contactId,
        type,
        subject,
        message,
        outcome,
      },
      include: { contact: true },
    });

    return NextResponse.json(communication, { status: 201 });
  } catch (error) {
    console.error('Error creating communication:', error);
    return NextResponse.json(
      { error: 'Failed to create communication' },
      { status: 500 }
    );
  }
}
