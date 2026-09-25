// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { idempotent } from '@/lib/api/idempotency';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';

export const dynamic = 'force-dynamic';

const MOVEMENT_TYPES = ['OPENING', 'SALE', 'WITHDRAWAL', 'REFUND', 'PAYMENT', 'CLOSING', 'ADJUSTMENT', 'OTHER'];

// POST create cash movement (sangria, refund, etc)
async function handlePOST(req: NextRequest) {
  try {
    // Any active member of THIS restaurant (a cashier does the sangria), recorded as createdBy
    const auth = await requireRestaurantRole(['OWNER', 'MANAGER', 'CASHIER', 'ADMIN']);
    if (!auth.ok) return auth.response;
    const { member } = auth;

    const body = await req.json();
    const { cashRegisterId, type, amount, description, reference, operatorName, notes } = body;

    if (!cashRegisterId || !type || amount === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      return NextResponse.json({ error: 'Valor inválido: informe um valor positivo' }, { status: 400 });
    }
    if (!MOVEMENT_TYPES.includes(type)) {
      return NextResponse.json({ error: 'Tipo de movimento inválido' }, { status: 400 });
    }

    // The register must belong to the caller's restaurant (it used to be found by id only, so anyone
    // signed in could post a withdrawal to another restaurant's register)
    const register = await prisma.cashRegister.findFirst({
      where: { id: cashRegisterId, restaurantId: member.restaurantId },
    });

    if (!register) {
      return NextResponse.json(
        { error: 'Cash register not found' },
        { status: 404 }
      );
    }

    const isDebit = ['WITHDRAWAL', 'REFUND'].includes(type);
    const movement = await prisma.$transaction(async (tx) => {
      const created = await tx.cashMovement.create({
        data: {
          cashRegisterId,
          type,
          amount: value,
          description,
          reference,
          operatorName,
          notes,
          createdBy: member.userId,
        },
      });
      await tx.cashRegister.update({
        where: { id: cashRegisterId },
        data: { expectedBalance: { increment: isDebit ? -value : value } },
      });
      return created;
    });

    return NextResponse.json(movement, { status: 201 });
  } catch (error) {
    console.error('Error creating cash movement:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Replayable by the offline queue: the same Idempotency-Key never runs twice (lib/api/idempotency.ts)
export const POST = idempotent(handlePOST);
