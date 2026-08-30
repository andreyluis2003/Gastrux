// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

// GET /api/admin/table-sections - List all table sections
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }

    const sections = await prisma.tableSection.findMany({
      where: { restaurantId },
      include: {
        tables: {
          include: {
            reservations: {
              where: {
                status: { in: ['CONFIRMED', 'PENDING'] },
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const sectionsWithStats = sections.map(section => ({
      ...section,
      totalTables: section.tables.length,
      occupiedTables: section.tables.filter(t => t.reservations.length > 0).length,
      occupancyRate: section.tables.length > 0
        ? Math.round((section.tables.filter(t => t.reservations.length > 0).length / section.tables.length) * 100)
        : 0,
    }));

    return NextResponse.json(sectionsWithStats);
  } catch (error) {
    console.error('Error fetching sections:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sections' },
      { status: 500 }
    );
  }
}

// POST /api/admin/table-sections - Create a new section
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only OWNER and MANAGER can create sections
    if (session.user?.role === 'COOK') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }

    const { name, description, capacity } = await req.json();

    if (!name || !capacity) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check if section with same name exists for this restaurant
    const existingSection = await prisma.tableSection.findFirst({
      where: { restaurantId, name },
    });

    if (existingSection) {
      return NextResponse.json(
        { error: 'Section with this name already exists' },
        { status: 409 }
      );
    }

    const section = await prisma.tableSection.create({
      data: {
        restaurantId,
        name,
        description,
        capacity: parseInt(capacity),
      },
    });

    return NextResponse.json(section, { status: 201 });
  } catch (error) {
    console.error('Error creating section:', error);
    return NextResponse.json(
      { error: 'Failed to create section' },
      { status: 500 }
    );
  }
}
