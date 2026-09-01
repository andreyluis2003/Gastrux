// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

/**
 * GET /api/suppliers/[id] - Get a specific supplier
 */
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
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
    }
    const supplier = await prisma.supplier.findFirst({
      where: { id: params.id, restaurantId },
      include: {
        ingredients: {
          include: {
            ingredient: true,
          },
        },
        integrations: true,
        priceSyncs: {
          include: {
            ingredient: true,
          },
        },
      },
    });

    if (!supplier) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
    }

    return NextResponse.json(supplier);
  } catch (error) {
    console.error('Error fetching supplier:', error);
    return NextResponse.json(
      { error: 'Failed to fetch supplier' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/suppliers/[id] - Update a supplier
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if ((session.user as any)?.role === 'COOK') {
      return NextResponse.json(
        { error: 'COOKs cannot update suppliers' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { name, cnpj, email, phone, address, city, state, country, contactPerson, status, notes } = body;

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
    }

    // Get previous state for audit
    const previousSupplier = await prisma.supplier.findFirst({
      where: { id: params.id, restaurantId },
    });

    if (!previousSupplier) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
    }

    const updatedSupplier = await prisma.supplier.update({
      where: { id: params.id },
      data: {
        ...(name && { name }),
        ...(cnpj && { cnpj }),
        ...(email && { email }),
        ...(phone && { phone }),
        ...(address && { address }),
        ...(city && { city }),
        ...(state && { state }),
        ...(country && { country }),
        ...(contactPerson && { contactPerson }),
        ...(status && { status }),
        ...(notes && { notes }),
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId: (session.user as any)?.id,
        action: 'UPDATE',
        entityType: 'Supplier',
        entityId: params.id,
        restaurantId,
        changes: JSON.stringify({
          previous: previousSupplier,
          updated: updatedSupplier,
        }),
      },
    });

    return NextResponse.json(updatedSupplier);
  } catch (error) {
    console.error('Error updating supplier:', error);
    return NextResponse.json(
      { error: 'Failed to update supplier' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/suppliers/[id] - Deactivate a supplier
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if ((session.user as any)?.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Only OWNER can delete suppliers' },
        { status: 403 }
      );
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
    }
    const existingSupplier = await prisma.supplier.findFirst({
      where: { id: params.id, restaurantId },
    });
    if (!existingSupplier) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
    }

    const supplier = await prisma.supplier.update({
      where: { id: params.id },
      data: { status: 'INACTIVE' },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId: (session.user as any)?.id,
        action: 'DELETE',
        entityType: 'Supplier',
        entityId: params.id,
        restaurantId,
        changes: JSON.stringify({ deactivated: true }),
      },
    });

    return NextResponse.json({ message: 'Supplier deactivated', supplier });
  } catch (error) {
    console.error('Error deleting supplier:', error);
    return NextResponse.json(
      { error: 'Failed to delete supplier' },
      { status: 500 }
    );
  }
}
