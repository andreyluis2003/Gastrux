// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/admin/tables/[id] - Get table details
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const table = await prisma.table.findUnique({
      where: { id: params.id },
      include: {
        section: true,
        reservations: {
          include: { guest: true },
          orderBy: { reservedAt: 'asc' },
        },
      },
    });

    if (!table) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    }

    return NextResponse.json(table);
  } catch (error) {
    console.error('Error fetching table:', error);
    return NextResponse.json(
      { error: 'Failed to fetch table' },
      { status: 500 }
    );
  }
}

// PUT /api/admin/tables/[id] - Update table
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only OWNER and MANAGER can update
    if (session.user?.role === 'COOK') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { capacity, description, isAvailable, maintenanceNote } = await req.json();

    const table = await prisma.table.update({
      where: { id: params.id },
      data: {
        ...(capacity !== undefined && { capacity }),
        ...(description !== undefined && { description }),
        ...(isAvailable !== undefined && { isAvailable }),
        ...(maintenanceNote !== undefined && { maintenanceNote }),
      },
      include: {
        section: true,
      },
    });

    return NextResponse.json(table);
  } catch (error) {
    console.error('Error updating table:', error);
    return NextResponse.json(
      { error: 'Failed to update table' },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/tables/[id] - Delete table
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only OWNER can delete
    if (session.user?.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Check for active reservations
    const activeReservations = await prisma.reservation.findMany({
      where: {
        tableId: params.id,
        status: { in: ['CONFIRMED', 'PENDING'] },
      },
    });

    if (activeReservations.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete table with active reservations' },
        { status: 409 }
      );
    }

    await prisma.table.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting table:', error);
    return NextResponse.json(
      { error: 'Failed to delete table' },
      { status: 500 }
    );
  }
}
