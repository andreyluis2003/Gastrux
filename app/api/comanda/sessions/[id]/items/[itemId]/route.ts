// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { idempotent } from '@/lib/api/idempotency';
import { isManager, recordAudit, requireRestaurantRole } from '@/lib/auth/restaurant-role';

export const dynamic = 'force-dynamic';

const ANY_MEMBER = ['OWNER', 'MANAGER', 'CASHIER', 'COOK', 'ADMIN'] as const;

/**
 * Market practice for a comanda line: before the kitchen has it, the waiter fixes a mistake freely
 * (it is still recorded); once the kitchen has it, removing or reducing it is a cancellation: a
 * manager of this restaurant, with a reason, and it leaves a trace.
 */
async function loadLine(params: { id: string; itemId: string }, restaurantId: string) {
  return prisma.orderSessionItem.findFirst({
    where: { id: params.itemId, sessionId: params.id, session: { restaurantId } },
    include: {
      session: { select: { status: true, sentToKitchenAt: true } },
      recipe: { select: { name: true } },
    },
  });
}

const kitchenHasIt = (line: { addedAt: Date; session: { sentToKitchenAt: Date | null } }) =>
  !!line.session.sentToKitchenAt && line.addedAt <= line.session.sentToKitchenAt;

const snapshot = (line: any) => ({
  itemId: line.id,
  recipe: line.recipe?.name,
  quantity: line.quantity,
  price: Number(line.price),
  sentToKitchen: kitchenHasIt(line),
});

// PUT /api/comanda/sessions/[id]/items/[itemId]
async function handlePUT(
  request: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  try {
    const auth = await requireRestaurantRole([...ANY_MEMBER]);
    if (!auth.ok) return auth.response;
    const { member } = auth;

    const line = await loadLine(params, member.restaurantId);
    if (!line) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

    const { quantity, specialInstructions, modifierIds, reason } = await request.json();

    if (quantity !== undefined && (!Number.isInteger(quantity) || quantity < 1)) {
      return NextResponse.json({ error: 'Quantidade inválida: use um número inteiro a partir de 1' }, { status: 400 });
    }
    if (specialInstructions !== undefined && specialInstructions !== null && String(specialInstructions).length > 140) {
      return NextResponse.json({ error: 'Observação longa demais (máx. 140 caracteres)' }, { status: 400 });
    }
    // What the kitchen already has is not changed under it (spec 2026-10-07, 4.2): only the quantity rule below
    if (kitchenHasIt(line) && (modifierIds !== undefined || specialInstructions !== undefined)) {
      return NextResponse.json({ error: 'A cozinha já recebeu este item: não dá para mudar adicionais ou observação' }, { status: 409 });
    }
    const reducing = quantity !== undefined && quantity < line.quantity;
    if (reducing && kitchenHasIt(line)) {
      if (!isManager(member)) {
        return NextResponse.json({ error: 'Reduzir um item que a cozinha já recebeu exige um gerente' }, { status: 403 });
      }
      if (String(reason ?? '').trim().length < 3) {
        return NextResponse.json({ error: 'Informe o motivo da redução' }, { status: 400 });
      }
    }

    // Modifiers are replaced as a whole list; each surcharge comes from the restaurant's own record
    let modifiers: Array<{ id: string; priceAdjustment: any }> | null = null;
    if (modifierIds !== undefined) {
      const ids = [...new Set((Array.isArray(modifierIds) ? modifierIds : []).map(String))];
      modifiers = ids.length
        ? await prisma.itemModifier.findMany({ where: { id: { in: ids }, restaurantId: member.restaurantId }, select: { id: true, priceAdjustment: true } })
        : [];
      if (modifiers.length !== ids.length) return NextResponse.json({ error: 'Adicional não encontrado' }, { status: 404 });
    }

    const item = await prisma.$transaction(async (tx) => {
      if (modifiers) {
        await tx.orderSessionItemModifier.deleteMany({ where: { sessionItemId: params.itemId } });
        if (modifiers.length) {
          await tx.orderSessionItemModifier.createMany({
            data: modifiers.map((m) => ({ sessionItemId: params.itemId, modifierId: m.id, priceAdjustment: m.priceAdjustment })),
          });
        }
      }
      return tx.orderSessionItem.update({
        where: { id: params.itemId },
        data: {
          quantity: quantity !== undefined ? quantity : undefined,
          specialInstructions: specialInstructions !== undefined ? (String(specialInstructions ?? '').trim() || null) : undefined,
        },
        include: {
          recipe: { select: { name: true, sellingPrice: true } },
          modifiers: { include: { modifier: { select: { name: true } } } },
        },
      });
    });

    if (quantity !== undefined && quantity !== line.quantity) {
      await recordAudit(member, {
        action: 'UPDATE',
        entityType: 'OrderSessionItem',
        entityId: line.id,
        changes: { sessionId: params.id, before: snapshot(line), quantity, reason: reason || null },
      });
    }

    return NextResponse.json(item);
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// DELETE /api/comanda/sessions/[id]/items/[itemId]  (body: { reason } when the kitchen has it)
async function handleDELETE(
  request: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  try {
    const auth = await requireRestaurantRole([...ANY_MEMBER]);
    if (!auth.ok) return auth.response;
    const { member } = auth;

    const line = await loadLine(params, member.restaurantId);
    if (!line) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const reason = String(body?.reason ?? '').trim();
    if (kitchenHasIt(line)) {
      if (!isManager(member)) {
        return NextResponse.json({ error: 'Cancelar um item que a cozinha já recebeu exige um gerente' }, { status: 403 });
      }
      if (reason.length < 3) {
        return NextResponse.json({ error: 'Informe o motivo do cancelamento do item' }, { status: 400 });
      }
    }

    await prisma.orderSessionItem.delete({
      where: { id: params.itemId },
    });

    await recordAudit(member, {
      action: 'DELETE',
      entityType: 'OrderSessionItem',
      entityId: line.id,
      changes: { sessionId: params.id, removed: snapshot(line), reason: reason || null },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// Replayable by the offline queue: the same Idempotency-Key never runs twice (lib/api/idempotency.ts)
export const PUT = idempotent(handlePUT);

// Replayable by the offline queue: the same Idempotency-Key never runs twice (lib/api/idempotency.ts)
export const DELETE = idempotent(handleDELETE);
