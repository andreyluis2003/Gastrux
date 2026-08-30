// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!session || user?.role === 'COOK') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { quantity, notes } = body;

    const item = await prisma.productionPlanItem.findUnique({
      where: { id: params.itemId },
      include: { recipe: true },
    });

    if (!item || item.planId !== params.id) {
      return NextResponse.json({ error: 'Item não encontrado' }, { status: 404 });
    }

    const newQuantity = quantity !== undefined ? parseFloat(quantity) : item.quantity;
    const estimatedCost = item.recipe.costPerPortion * newQuantity;

    const updated = await prisma.productionPlanItem.update({
      where: { id: params.itemId },
      data: {
        quantity: newQuantity,
        estimatedCost,
        notes: notes !== undefined ? notes : item.notes,
      },
      include: { recipe: true },
    });

    // Recalcular custo total do plano
    const totalCost = await prisma.productionPlanItem.aggregate({
      where: { planId: params.id },
      _sum: { estimatedCost: true },
    });

    await prisma.productionPlan.update({
      where: { id: params.id },
      data: { totalCost: totalCost._sum.estimatedCost || 0 },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'UPDATE',
        entityType: 'ProductionPlanItem',
        entityId: params.itemId,
        changes: JSON.stringify({ quantity: newQuantity, estimatedCost }),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating production plan item:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!session || user?.role === 'COOK') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const item = await prisma.productionPlanItem.findUnique({
      where: { id: params.itemId },
    });

    if (!item || item.planId !== params.id) {
      return NextResponse.json({ error: 'Item não encontrado' }, { status: 404 });
    }

    await prisma.productionPlanItem.delete({
      where: { id: params.itemId },
    });

    // Recalcular custo total do plano
    const totalCost = await prisma.productionPlanItem.aggregate({
      where: { planId: params.id },
      _sum: { estimatedCost: true },
    });

    await prisma.productionPlan.update({
      where: { id: params.id },
      data: { totalCost: totalCost._sum.estimatedCost || 0 },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'DELETE',
        entityType: 'ProductionPlanItem',
        entityId: params.itemId,
        changes: JSON.stringify({ deleted: true }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting production plan item:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
