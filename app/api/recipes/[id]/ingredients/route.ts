// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;

  if (!session?.user || user?.role === 'COOK') {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { ingredientId, quantity, unit } = body;

    if (!ingredientId || !quantity || !unit) {
      return NextResponse.json(
        { error: 'ingredientId, quantity e unit sao obrigatorios' },
        { status: 400 }
      );
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
    }

    // Verificar se a receita existe e pertence ao tenant
    const recipe = await prisma.recipe.findFirst({
      where: { id: params.id, restaurantId },
    });

    if (!recipe) {
      return NextResponse.json(
        { error: 'Receita não encontrada' },
        { status: 404 }
      );
    }

    // Verificar se o ingrediente existe e pertence ao tenant
    const ingredient = await prisma.ingredient.findFirst({
      where: { id: ingredientId, restaurantId },
    });

    if (!ingredient) {
      return NextResponse.json(
        { error: 'Ingrediente não encontrado' },
        { status: 404 }
      );
    }

    // Adicionar ou atualizar ingrediente na receita (upsert por unique constraint)
    const recipeIngredient = await prisma.recipeIngredient.upsert({
      where: {
        recipeId_ingredientId: {
          recipeId: params.id,
          ingredientId: ingredientId,
        },
      },
      update: {
        quantity: parseFloat(quantity),
        unit: unit,
      },
      create: {
        recipeId: params.id,
        ingredientId: ingredientId,
        quantity: parseFloat(quantity),
        unit: unit,
      },
      include: {
        ingredient: {
          include: {
            category: true,
            currentStock: true,
          },
        },
      },
    });

    // Registrar auditoria
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'CREATE',
        entityType: 'RecipeIngredient',
        entityId: recipeIngredient.id,
        changes: JSON.stringify({ ingredientId, quantity, unit }),
      },
    });

    return NextResponse.json(recipeIngredient);
  } catch (error) {
    console.error('Error adding ingredient to recipe:', error);
    return NextResponse.json(
      { error: 'Erro ao adicionar ingrediente' },
      { status: 500 }
    );
  }
}