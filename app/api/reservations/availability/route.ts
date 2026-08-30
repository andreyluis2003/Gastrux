// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

// GET /api/reservations/availability - Get availability calendar data
export async function GET(req: NextRequest) {
  try {

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const month = searchParams.get('month'); // e.g., "2024-01"
    const partySize = searchParams.get('partySize') || '2';

    if (!month) {
      return NextResponse.json(
        { error: 'Missing month parameter' },
        { status: 400 }
      );
    }

    const size = parseInt(partySize);
    const [year, monthNum] = month.split('-').map(Number);
    
    // Get all days in month
    const daysInMonth = new Date(year, monthNum, 0).getDate();
    const availability: any = {};

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dateObj = new Date(`${dateStr}T00:00:00`);

      // Skip past dates
      if (dateObj < new Date()) {
        continue;
      }

      // Check availability for lunch (12:00) and dinner (19:00)
      const times = ['12:00', '19:00'];
      const dayAvailability: any = {};

      for (const time of times) {
        const reservedAt = new Date(`${dateStr}T${time}`);
        const endTime = new Date(reservedAt.getTime() + 90 * 60000);

        const availableTablesCount = await prisma.table.count({
          where: {
            restaurantId,
            capacity: { gte: size },
            reservations: {
              none: {
                status: { in: ['CONFIRMED', 'PENDING'] },
                reservedAt: { lt: endTime },
                AND: {
                  reservedAt: { gte: reservedAt },
                },
              },
            },
          },
        });

        dayAvailability[time] = availableTablesCount > 0;
      }

      // Mark day as available if at least one time slot is available
      availability[dateStr] = Object.values(dayAvailability).some(v => v === true);
    }

    return NextResponse.json({
      month,
      partySize: size,
      availability,
    });
  } catch (error) {
    console.error('Error fetching availability:', error);
    return NextResponse.json(
      { error: 'Failed to fetch availability' },
      { status: 500 }
    );
  }
}
