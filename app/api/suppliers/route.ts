// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { safeHandler } from '@/lib/api/safe-handler';
import { ApiErrors } from '@/lib/api/api-response';

export const dynamic = 'force-dynamic';

/**
 * GET /api/suppliers - Retrieve all suppliers for current restaurant
 */
export const GET = safeHandler(async (req, context) => {
  const suppliers = await prisma.supplier.findMany({
    where: { restaurantId: context.restaurantId },
    include: {
      ingredients: {
        include: {
          ingredient: true,
        },
      },
      integrations: true,
      priceSyncs: true,
    },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json(suppliers);
});

/**
 * POST /api/suppliers - Create a new supplier
 */
export const POST = safeHandler(async (req, context) => {
  if (context.role === 'COOK') {
    return ApiErrors.FORBIDDEN();
  }

  const body = await req.json();
  const { code, name, cnpj, email, phone, address, city, state, country, contactPerson, notes } = body;

  if (!code || !name) {
    return ApiErrors.INVALID_REQUEST({
      message: 'Code and name are required',
    });
  }

  const supplier = await prisma.supplier.create({
    data: {
      code,
      name,
      cnpj: cnpj || null,
      email: email || null,
      phone: phone || null,
      address: address || null,
      city: city || null,
      state: state || null,
      country: country || null,
      contactPerson: contactPerson || null,
      notes: notes || null,
      restaurantId: context.restaurantId,
    },
  });

  // Log audit
  await prisma.auditLog.create({
    data: {
      userId: context.userId,
      action: 'CREATE',
      entityType: 'Supplier',
      entityId: supplier.id,
      restaurantId: context.restaurantId,
      changes: JSON.stringify(supplier),
    },
  });

  return NextResponse.json(supplier, { status: 201 });
});
