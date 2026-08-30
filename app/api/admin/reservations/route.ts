// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/admin/reservations - List all reservations
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const page = parseInt(searchParams.get('page') || '0');
    const limit = parseInt(searchParams.get('limit') || '20');

    const where: any = {};
    
    if (status) where.status = status;
    
    if (startDate && endDate) {
      where.reservedAt = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    const [reservations, total] = await Promise.all([
      prisma.reservation.findMany({
        where,
        include: {
          guest: true,
          table: {
            include: { section: true },
          },
          reminders: true,
        },
        orderBy: { reservedAt: 'asc' },
        skip: page * limit,
        take: limit,
      }),
      prisma.reservation.count({ where }),
    ]);

    return NextResponse.json({
      reservations,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error fetching reservations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch reservations' },
      { status: 500 }
    );
  }
}

// POST /api/admin/reservations - Create a reservation (admin)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      guestName,
      guestEmail,
      guestPhone,
      partySize,
      tableId,
      reservedAt,
      duration,
      notes,
    } = await req.json();

    if (!guestName || !guestEmail || !partySize || !reservedAt) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check if table exists and has capacity
    if (tableId) {
      const table = await prisma.table.findUnique({
        where: { id: tableId },
      });

      if (!table) {
        return NextResponse.json(
          { error: 'Table not found' },
          { status: 404 }
        );
      }

      if (table.capacity < partySize) {
        return NextResponse.json(
          { error: 'Party size exceeds table capacity' },
          { status: 400 }
        );
      }

      // Check for conflicts with existing reservations
      const reservedAt_date = new Date(reservedAt);
      const endTime = new Date(reservedAt_date.getTime() + (duration || 90) * 60000);

      const conflicts = await prisma.reservation.findMany({
        where: {
          tableId,
          status: { in: ['CONFIRMED', 'PENDING'] },
          reservedAt: {
            lt: endTime,
          },
          NOT: {
            reservedAt: {
              gte: new Date(endTime),
            },
          },
        },
      });

      if (conflicts.length > 0) {
        return NextResponse.json(
          { error: 'Table is not available at this time' },
          { status: 409 }
        );
      }
    }

    // Get or create guest profile
    let guest = await prisma.guestProfile.findUnique({
      where: { email: guestEmail },
    });

    if (!guest) {
      guest = await prisma.guestProfile.create({
        data: {
          name: guestName,
          email: guestEmail,
          phone: guestPhone,
        },
      });
    }

    const reservation = await prisma.reservation.create({
      data: {
        guestId: guest.id,
        guestName,
        guestEmail,
        guestPhone,
        partySize: parseInt(partySize),
        tableId,
        reservedAt: new Date(reservedAt),
        duration: duration || 90,
        notes,
        status: 'CONFIRMED',
      },
      include: {
        guest: true,
        table: {
          include: { section: true },
        },
      },
    });

    // Update guest stats
    await prisma.guestProfile.update({
      where: { id: guest.id },
      data: {
        totalReservations: { increment: 1 },
        lastReservationAt: new Date(),
      },
    });

    return NextResponse.json(reservation, { status: 201 });
  } catch (error) {
    console.error('Error creating reservation:', error);
    return NextResponse.json(
      { error: 'Failed to create reservation' },
      { status: 500 }
    );
  }
}
