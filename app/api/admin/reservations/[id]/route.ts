// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/admin/reservations/[id] - Get reservation details
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const reservation = await prisma.reservation.findUnique({
      where: { id: params.id },
      include: {
        guest: true,
        table: {
          include: { section: true },
        },
        reminders: true,
      },
    });

    if (!reservation) {
      return NextResponse.json(
        { error: 'Reservation not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(reservation);
  } catch (error) {
    console.error('Error fetching reservation:', error);
    return NextResponse.json(
      { error: 'Failed to fetch reservation' },
      { status: 500 }
    );
  }
}

// PUT /api/admin/reservations/[id] - Update reservation
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      status,
      tableId,
      partySize,
      reservedAt,
      duration,
      notes,
      isNoShow,
      noShowReason,
    } = await req.json();

    const reservation = await prisma.reservation.update({
      where: { id: params.id },
      data: {
        ...(status && { status }),
        ...(tableId !== undefined && { tableId }),
        ...(partySize && { partySize }),
        ...(reservedAt && { reservedAt: new Date(reservedAt) }),
        ...(duration && { duration }),
        ...(notes !== undefined && { notes }),
        ...(isNoShow !== undefined && { isNoShow }),
        ...(noShowReason !== undefined && { noShowReason }),
      },
      include: {
        guest: true,
        table: {
          include: { section: true },
        },
      },
    });

    // Update guest stats if marked as no-show
    if (isNoShow === true && !reservation.isNoShow && reservation.guestId) {
      await prisma.guestProfile.update({
        where: { id: reservation.guestId },
        data: { noShowCount: { increment: 1 } },
      });
    }

    return NextResponse.json(reservation);
  } catch (error) {
    console.error('Error updating reservation:', error);
    return NextResponse.json(
      { error: 'Failed to update reservation' },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/reservations/[id] - Cancel reservation
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const reservation = await prisma.reservation.update({
      where: { id: params.id },
      data: { status: 'RESTAURANT_CANCELLED' },
      include: {
        guest: true,
      },
    });

    return NextResponse.json(reservation);
  } catch (error) {
    console.error('Error cancelling reservation:', error);
    return NextResponse.json(
      { error: 'Failed to cancel reservation' },
      { status: 500 }
    );
  }
}
