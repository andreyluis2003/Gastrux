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

  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) {
    return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
  }

  try {
    const recipe = await prisma.recipe.findFirst({
      where: { id: params.id, restaurantId },
      include: {
        ingredients: {
          include: {
            ingredient: {
              include: {
                category: true,
                currentStock: true,
              },
            },
          },
        },
      },
    });

    if (!recipe || !recipe.active) {
      return NextResponse.json(
        { error: 'Receita não encontrada' },
        { status: 404 }
      );
    }

    return NextResponse.json(recipe, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (error) {
    console.error('Error fetching recipe:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar receita' },
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

  if (!session?.user || user?.role === 'COOK') {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  try {
    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
    }

    const body = await req.json();
    const existing = await prisma.recipe.findFirst({ where: { id: params.id, restaurantId } });

    if (!existing) {
      return NextResponse.json(
        { error: 'Receita não encontrada' },
        { status: 404 }
      );
    }

    const recipe = await prisma.recipe.update({
      where: { id: params.id },
      data: {
        name: body.name,
        description: body.description,
        baseYield: body.baseYield,
        yieldUnit: body.yieldUnit,
        portionSize: body.portionSize,
        portionUnit: body.portionUnit,
        prepTimeMinutes: body.prepTimeMinutes,
        yieldLossFactor: body.yieldLossFactor,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'UPDATE',
        entityType: 'Recipe',
        entityId: recipe.id,
        changes: JSON.stringify({ old: existing, new: recipe }),
      },
    });

    return NextResponse.json(recipe);
  } catch (error) {
    console.error('Error updating recipe:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar receita' },
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

  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) {
    return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
  }

  try {
    const existing = await prisma.recipe.findFirst({ where: { id: params.id, restaurantId } });
    if (!existing) {
      return NextResponse.json({ error: 'Receita não encontrada' }, { status: 404 });
    }

    await prisma.recipe.update({
      where: { id: params.id },
      data: { active: false },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'DELETE',
        entityType: 'Recipe',
        entityId: params.id,
        changes: JSON.stringify({ action: 'deactivated' }),
      },
    });

    return NextResponse.json({ message: 'Receita desativada com sucesso' });
  } catch (error) {
    console.error('Error deleting recipe:', error);
    return NextResponse.json(
      { error: 'Erro ao deletar receita' },
      { status: 500 }
    );
  }
}
