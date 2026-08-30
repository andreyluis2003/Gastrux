// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  try {
    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
    }
    const ingredient = await prisma.ingredient.findFirst({
      where: { id: params.id, restaurantId },
      include: { category: true, suppliers: true, currentStock: true },
    });

    if (!ingredient) {
      return NextResponse.json(
        { error: 'Insumo não encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json(ingredient);
  } catch (error) {
    console.error('Error fetching ingredient:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar insumo' },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  
  if (!session?.user || (user?.role === 'COOK')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  try {
    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
    }
    const body = await req.json();
    const oldIngredient = await prisma.ingredient.findFirst({
      where: { id: params.id, restaurantId },
    });

    if (!oldIngredient) {
      return NextResponse.json({ error: 'Insumo não encontrado' }, { status: 404 });
    }

    const ingredient = await prisma.ingredient.update({
      where: { id: params.id },
      data: {
        name: body.name,
        description: body.description,
        categoryId: body.categoryId,
        minimumStock: body.minimumStock,
        referenceCost: body.referenceCost,
      },
      include: { category: true },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'UPDATE',
        entityType: 'Ingredient',
        entityId: ingredient.id,
        changes: JSON.stringify({ old: oldIngredient, new: ingredient }),
      },
    });

    return NextResponse.json(ingredient);
  } catch (error) {
    console.error('Error updating ingredient:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar insumo' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  
  if (!session?.user || user?.role !== 'OWNER') {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  try {
    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
    }
    const ingredient = await prisma.ingredient.findFirst({
      where: { id: params.id, restaurantId },
    });

    if (!ingredient) {
      return NextResponse.json(
        { error: 'Insumo não encontrado' },
        { status: 404 }
      );
    }

    await prisma.ingredient.update({
      where: { id: params.id },
      data: { active: false },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'DELETE',
        entityType: 'Ingredient',
        entityId: ingredient.id,
        changes: JSON.stringify({ active: false }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting ingredient:', error);
    return NextResponse.json(
      { error: 'Erro ao deletar insumo' },
      { status: 500 }
    );
  }
}
