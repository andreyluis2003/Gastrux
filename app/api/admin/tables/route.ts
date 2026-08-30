// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { randomBytes } from 'crypto';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

// FASE 50: Generate unique QR token for new table
function generateQrToken(): string {
  return randomBytes(16).toString('hex');
}

// GET /api/admin/tables - List all tables with sections
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

    const { searchParams } = new URL(req.url);
    const sectionId = searchParams.get('sectionId');
    const available = searchParams.get('available');

    const where: any = { restaurantId };
    if (sectionId) where.sectionId = sectionId;
    if (available === 'true') where.isAvailable = true;
    if (available === 'false') where.isAvailable = false;

    const tables = await prisma.table.findMany({
      where,
      include: {
        section: true,
        reservations: {
          where: {
            status: {
              in: ['CONFIRMED', 'PENDING'],
            },
          },
          orderBy: { reservedAt: 'asc' },
        },
      },
      orderBy: [
        { section: { name: 'asc' } },
        { number: 'asc' },
      ],
    });

    const sections = await prisma.tableSection.findMany({
      where: { restaurantId },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({
      tables,
      sections,
      total: tables.length,
    });
  } catch (error) {
    console.error('Error fetching tables:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tables' },
      { status: 500 }
    );
  }
}

// POST /api/admin/tables - Create a new table
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only OWNER and MANAGER can create tables
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

    const { sectionId, number, capacity, description } = await req.json();

    // Validate inputs
    if (!sectionId || !number || !capacity) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check if section exists
    const section = await prisma.tableSection.findUnique({
      where: { id: sectionId },
    });
    if (!section) {
      return NextResponse.json(
        { error: 'Section not found' },
        { status: 404 }
      );
    }

    // Check if table with same number exists in section
    const existingTable = await prisma.table.findFirst({
      where: {
        restaurantId,
        sectionId,
        number: parseInt(number),
      },
    });

    if (existingTable) {
      return NextResponse.json(
        { error: 'Table with this number already exists in this section' },
        { status: 409 }
      );
    }

    // FASE 50: Generate unique QR token for new table
    let qrToken = generateQrToken();
    for (let i = 0; i < 5; i++) {
      const exists = await prisma.table.findUnique({ where: { qrToken } });
      if (!exists) break;
      qrToken = generateQrToken();
    }

    const table = await prisma.table.create({
      data: {
        restaurantId,
        sectionId,
        number: parseInt(number),
        capacity: parseInt(capacity),
        description,
        qrToken,
      },
      include: {
        section: true,
      },
    });

    return NextResponse.json(table, { status: 201 });
  } catch (error) {
    console.error('Error creating table:', error);
    return NextResponse.json(
      { error: 'Failed to create table' },
      { status: 500 }
    );
  }
}
