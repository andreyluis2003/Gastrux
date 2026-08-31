// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/reservations - Get available tables for a specific time, for one restaurant
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const restaurantId = searchParams.get('restaurantId');
    const date = searchParams.get('date');
    const time = searchParams.get('time');
    const partySize = searchParams.get('partySize');

    if (!restaurantId || !date || !time || !partySize) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Parse datetime
    const reservedAt = new Date(`${date}T${time}`);
    const duration = 90; // default duration
    const endTime = new Date(reservedAt.getTime() + duration * 60000);
    const size = parseInt(partySize);

    // Find tables with capacity and no conflicts, scoped to this restaurant
    const availableTables = await prisma.table.findMany({
      where: {
        restaurantId,
        isAvailable: true,
        capacity: {
          gte: size,
        },
        reservations: {
          none: {
            status: { in: ['CONFIRMED', 'PENDING'] },
            reservedAt: {
              lt: endTime,
            },
            AND: {
              reservedAt: {
                gte: reservedAt,
              },
            },
          },
        },
      },
      include: {
        section: true,
      },
      orderBy: [
        { capacity: 'asc' }, // Prefer smaller tables
        { section: { name: 'asc' } },
        { number: 'asc' },
      ],
    });

    return NextResponse.json({
      availableTables,
      total: availableTables.length,
      requestedTime: reservedAt.toISOString(),
      duration,
    });
  } catch (error) {
    console.error('Error fetching available tables:', error);
    return NextResponse.json(
      { error: 'Failed to fetch available tables' },
      { status: 500 }
    );
  }
}

// POST /api/reservations - Create a new reservation (public, one restaurant)
export async function POST(req: NextRequest) {
  try {
    const {
      restaurantId,
      guestName,
      guestEmail,
      guestPhone,
      partySize,
      tableId,
      reservedAt,
      notes,
    } = await req.json();

    if (!restaurantId || !guestName || !guestEmail || !partySize || !reservedAt) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const reserved_at = new Date(reservedAt);
    const duration = 90;
    const endTime = new Date(reserved_at.getTime() + duration * 60000);

    // Validate table if provided (must belong to this restaurant)
    if (tableId) {
      const table = await prisma.table.findFirst({
        where: { id: tableId, restaurantId },
      });

      if (!table) {
        return NextResponse.json(
          { error: 'Table not found' },
          { status: 404 }
        );
      }

      if (table.capacity < parseInt(partySize)) {
        return NextResponse.json(
          { error: 'Party size exceeds table capacity' },
          { status: 400 }
        );
      }

      // Check for conflicts
      const conflicts = await prisma.reservation.findMany({
        where: {
          restaurantId,
          tableId,
          status: { in: ['CONFIRMED', 'PENDING'] },
          reservedAt: {
            lt: endTime,
          },
          NOT: {
            reservedAt: {
              gte: endTime,
            },
          },
        },
      });

      if (conflicts.length > 0) {
        return NextResponse.json(
          { error: 'Table is no longer available at this time' },
          { status: 409 }
        );
      }
    }

    // Get or create guest profile, scoped to this restaurant (the same email
    // can be a guest at multiple restaurants - see GuestProfile's
    // @@unique([restaurantId, email])).
    let guest = await prisma.guestProfile.findUnique({
      where: { restaurantId_email: { restaurantId, email: guestEmail } },
    });

    if (!guest) {
      guest = await prisma.guestProfile.create({
        data: {
          restaurantId,
          name: guestName,
          email: guestEmail,
          phone: guestPhone,
          firstReservationAt: new Date(),
        },
      });
    }

    const reservation = await prisma.reservation.create({
      data: {
        restaurantId,
        guestId: guest.id,
        guestName,
        guestEmail,
        guestPhone,
        partySize: parseInt(partySize),
        tableId,
        reservedAt: reserved_at,
        duration,
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
