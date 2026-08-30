// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !['ADMIN'].includes(session.user?.role as string)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tester = await prisma.betaTester.findUnique({
      where: { id: params.id },
      include: {
        interactions: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!tester) {
      return NextResponse.json({ error: 'Beta tester not found' }, { status: 404 });
    }

    return NextResponse.json(tester);
  } catch (error) {
    console.error('Error fetching beta tester:', error);
    return NextResponse.json(
      { error: 'Failed to fetch beta tester' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !['ADMIN'].includes(session.user?.role as string)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();

    const tester = await prisma.betaTester.update({
      where: { id: params.id },
      data: {
        ...body,
        confirmedAt: body.status === 'confirmed' && !body.confirmedAt ? new Date() : body.confirmedAt,
        accessGrantedAt: body.status === 'active' && !body.accessGrantedAt ? new Date() : body.accessGrantedAt,
        lastInteractionAt: new Date(),
      },
    });

    return NextResponse.json(tester);
  } catch (error) {
    console.error('Error updating beta tester:', error);
    return NextResponse.json(
      { error: 'Failed to update beta tester' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !['ADMIN'].includes(session.user?.role as string)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await prisma.betaTester.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting beta tester:', error);
    return NextResponse.json(
      { error: 'Failed to delete beta tester' },
      { status: 500 }
    );
  }
}
