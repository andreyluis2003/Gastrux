// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';
import { Decimal } from '@prisma/client/runtime/library';

export const dynamic = 'force-dynamic';

// POST /api/comanda/sessions/[id]/items
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });

    const { recipeId, menuItemId, quantity, specialInstructions } = await request.json();

    const orderSession = await prisma.orderSession.findFirst({
      where: { id: params.id, restaurantId },
    });

    if (!orderSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    let resolvedRecipeId = recipeId;
    let itemPrice: number | null = null;

    // Se veio menuItemId, busca o item do cardápio para obter recipeId e preço
    if (menuItemId) {
      const menuItem = await prisma.menuItem.findFirst({
        where: { id: menuItemId, restaurantId },
        include: { recipe: { select: { id: true, sellingPrice: true } } },
      });
      if (!menuItem) {
        return NextResponse.json({ error: 'Menu item not found' }, { status: 404 });
      }
      resolvedRecipeId = menuItem.recipeId || menuItem.recipe?.id || null;
      itemPrice = Number(menuItem.price) || 0;
    }

    // Se temos um recipeId, valida que a receita existe
    if (resolvedRecipeId) {
      const recipe = await prisma.recipe.findFirst({
        where: { id: resolvedRecipeId, restaurantId },
      });
      if (!recipe) {
        return NextResponse.json({ error: 'Recipe not found' }, { status: 404 });
      }
      if (itemPrice === null) {
        itemPrice = Number(recipe.sellingPrice) || 0;
      }
    }

    if (!resolvedRecipeId) {
      return NextResponse.json(
        { error: 'Este item do cardápio não está vinculado a uma receita. Vincule uma receita primeiro.' },
        { status: 400 }
      );
    }

    const item = await prisma.orderSessionItem.create({
      data: {
        sessionId: params.id,
        recipeId: resolvedRecipeId,
        quantity: quantity || 1,
        price: new Decimal(itemPrice || 0),
        specialInstructions: specialInstructions || null,
      },
      include: {
        recipe: { select: { name: true, sellingPrice: true } },
      },
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
