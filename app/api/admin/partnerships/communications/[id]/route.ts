// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !['ADMIN'].includes(session.user?.role as string)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();

    const communication = await prisma.partnershipCommunication.update({
      where: { id: params.id },
      data: {
        ...body,
        responseDate: body.outcome ? new Date() : undefined,
      },
      include: { contact: true },
    });

    return NextResponse.json(communication);
  } catch (error) {
    console.error('Error updating communication:', error);
    return NextResponse.json(
      { error: 'Failed to update communication' },
      { status: 500 }
    );
  }
}
