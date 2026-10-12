// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';
import { requireRestaurantRole, MANAGER_ROLES } from '@/lib/auth/restaurant-role';
import { OPEN_STATUSES } from '@/lib/comanda/transfer';

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

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }

    const table = await prisma.table.findFirst({
      where: { id: params.id, restaurantId },
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

    // Only OWNER and MANAGER of this restaurant can update (membership role, not the global one)
    const auth = await requireRestaurantRole(MANAGER_ROLES);
    if (!auth.ok) return auth.response;
    const restaurantId = auth.member.restaurantId;

    const owned = await prisma.table.findFirst({
      where: { id: params.id, restaurantId },
      select: { id: true, number: true, sectionId: true },
    });
    if (!owned) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    }

    const { number, sectionId, capacity, description, isAvailable, maintenanceNote } = await req.json();

    const isPositiveInt = (v: any) => typeof v === 'number' && Number.isInteger(v) && v > 0;
    if (number !== undefined && !isPositiveInt(number)) {
      return NextResponse.json({ error: 'O número da mesa deve ser um inteiro positivo' }, { status: 400 });
    }
    if (capacity !== undefined && !isPositiveInt(capacity)) {
      return NextResponse.json({ error: 'Os lugares devem ser um inteiro positivo' }, { status: 400 });
    }

    if (sectionId !== undefined) {
      if (typeof sectionId !== 'string') {
        return NextResponse.json({ error: 'Seção inválida' }, { status: 400 });
      }
      const section = await prisma.tableSection.findFirst({ where: { id: sectionId, restaurantId }, select: { id: true } });
      if (!section) {
        return NextResponse.json({ error: 'Seção inválida' }, { status: 400 });
      }
    }

    const targetNumber = number !== undefined ? number : owned.number;
    const targetSection = sectionId !== undefined ? sectionId : owned.sectionId;
    const duplicateMessage = `Já existe a Mesa ${targetNumber} nesta seção`;
    if (targetNumber !== owned.number || targetSection !== owned.sectionId) {
      const clash = await prisma.table.findFirst({
        where: { restaurantId, sectionId: targetSection, number: targetNumber, id: { not: params.id } },
        select: { id: true },
      });
      if (clash) {
        return NextResponse.json({ error: duplicateMessage }, { status: 409 });
      }
    }

    let table;
    try {
      table = await prisma.table.update({
        where: { id: params.id },
        data: {
          ...(number !== undefined && { number }),
          ...(sectionId !== undefined && { sectionId }),
          ...(capacity !== undefined && { capacity }),
          ...(description !== undefined && { description }),
          ...(isAvailable !== undefined && { isAvailable }),
          ...(maintenanceNote !== undefined && { maintenanceNote }),
        },
        include: {
          section: true,
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        return NextResponse.json({ error: duplicateMessage }, { status: 409 });
      }
      throw error;
    }

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

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }

    const owned = await prisma.table.findFirst({ where: { id: params.id, restaurantId }, select: { id: true, number: true } });
    if (!owned) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
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
        { error: `A Mesa ${owned.number} tem reservas ativas. Cancele ou mude as reservas antes de excluir.` },
        { status: 409 }
      );
    }

    // An open comanda would lose its table (the link is set to null) and show as "Balcão" (2026-10-12).
    // Under the lock a tap on the table takes to open its comanda, so one opened at the same time is seen.
    const deleted = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'comanda-table:' + params.id}))`;
      const open = await tx.orderSession.count({ where: { tableId: params.id, status: { in: [...OPEN_STATUSES] } } });
      if (open) return false;
      await tx.table.delete({ where: { id: params.id } });
      return true;
    });
    if (!deleted) {
      return NextResponse.json(
        { error: `A Mesa ${owned.number} tem uma comanda aberta. Feche a conta ou transfira os itens antes de excluir.` },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting table:', error);
    return NextResponse.json(
      { error: 'Failed to delete table' },
      { status: 500 }
    );
  }
}
