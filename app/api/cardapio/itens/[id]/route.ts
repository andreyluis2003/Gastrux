// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { CODE_TAKEN, isCodeTaken, parseProductCode } from '@/lib/cardapio/product-code';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ensureMenuItemRecipes, isProductRecipe, retireProductRecipe, syncProductRecipe } from '@/lib/cardapio/product-recipe';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { normalizeDays } from '@/lib/cardapio/days';
import { removeProductPhoto } from '@/lib/cardapio/product-photo';

export const dynamic = 'force-dynamic';

// GET menu item details
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
    }
    const item = await prisma.menuItem.findFirst({
      where: { id: params.id, restaurantId },
      include: {
        category: true,
        images: true,
      },
    });

    if (!item) {
      return NextResponse.json({ error: 'Menu item not found' }, { status: 404 });
    }

    return NextResponse.json(item);
  } catch (error) {
    console.error('Error fetching menu item:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT update menu item
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Menu, prices, money and settings are changed by the owner or a manager (it accepted any role)
    const managerCheck = await requireRestaurantRole(MANAGER_ROLES, 'Alterar o cardápio exige um gerente');
    if (!managerCheck.ok) return managerCheck.response;
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
    }
    const existingItem = await prisma.menuItem.findFirst({
      where: { id: params.id, restaurantId },
      select: { id: true, recipeId: true, recipe: { select: { code: true, _count: { select: { ingredients: true } } } } },
    });
    if (!existingItem) {
      return NextResponse.json({ error: 'Menu item not found' }, { status: 404 });
    }

    const body = await req.json();
    // "Sem ficha técnica" on an item already on its ficha simples keeps that ficha (no new one each save)
    if (body.recipeId !== undefined && !body.recipeId && existingItem.recipe && isProductRecipe(existingItem.recipe)) {
      delete body.recipeId;
    }
    const { name, description, price, available, position, displayOnQR, displayOnWeb, recipeId, categoryId } = body;
    const code = parseProductCode(body.code);
    if (!code.ok) return NextResponse.json({ error: code.error }, { status: 400 });
    // A price that is not a number used to reach the database as NaN (spec 2026-11-06 cardapio-rapido)
    const priceNum = price !== undefined ? Number(String(price).replace(',', '.')) : undefined;
    if (priceNum !== undefined && (!Number.isFinite(priceNum) || priceNum < 0.01 || priceNum > 99999)) {
      return NextResponse.json({ error: 'Preço entre R$ 0,01 e R$ 99.999' }, { status: 400 });
    }
    const days = body.availableDays !== undefined ? normalizeDays(body.availableDays) : undefined;
    if (days === null) {
      return NextResponse.json({ error: 'Dias da semana inválidos' }, { status: 400 });
    }

    if (recipeId) {
      const recipe = await prisma.recipe.findFirst({ where: { id: recipeId, restaurantId }, select: { id: true } });
      if (!recipe) {
        return NextResponse.json({ error: 'Recipe not found' }, { status: 404 });
      }
    }

    if (categoryId) {
      const category = await prisma.menuCategory.findFirst({ where: { id: categoryId, restaurantId }, select: { id: true } });
      if (!category) {
        return NextResponse.json({ error: 'Category not found' }, { status: 404 });
      }
    }

    try {
    await prisma.menuItem.update({
      where: { id: params.id },
      data: {
        ...(code.code !== undefined && { code: code.code }),
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(priceNum !== undefined && { price: Math.round(priceNum * 100) / 100 }),
        ...(days !== undefined && { availableDays: days }),
        ...(available !== undefined && { available }),
        ...(position !== undefined && { position }),
        ...(displayOnQR !== undefined && { displayOnQR }),
        ...(typeof body.soldByWeight === 'boolean' && { soldByWeight: body.soldByWeight }),
        ...(displayOnWeb !== undefined && { displayOnWeb }),
        ...(recipeId !== undefined && { recipeId: recipeId || null }),
        ...(categoryId !== undefined && { categoryId }),
      },
    });
    } catch (e) {
      if (isCodeTaken(e)) return NextResponse.json({ error: CODE_TAKEN }, { status: 400 });
      throw e;
    }
    // Unlinked from its ficha técnica, it keeps selling on a ficha simples; a ficha simples follows the
    // item's name and price (the comanda, the kitchen and the cupom show the ficha's name) (2026-10-12)
    await ensureMenuItemRecipes(prisma, restaurantId, [params.id]);
    await syncProductRecipe(prisma, restaurantId, params.id);
    // Moved to another ficha: its former ficha simples, if no other item uses it, leaves the lists
    await retireProductRecipe(prisma, restaurantId, existingItem.recipeId);
    const item = await prisma.menuItem.findUnique({ where: { id: params.id }, include: { category: true, images: true } });

    return NextResponse.json(item);
  } catch (error) {
    console.error('Error updating menu item:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE menu item (soft delete)
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Menu, prices, money and settings are changed by the owner or a manager (it accepted any role)
    const managerCheck = await requireRestaurantRole(MANAGER_ROLES, 'Alterar o cardápio exige um gerente');
    if (!managerCheck.ok) return managerCheck.response;
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
    }
    const existingItem = await prisma.menuItem.findFirst({
      where: { id: params.id, restaurantId },
      select: { id: true, recipeId: true },
    });
    if (!existingItem) {
      return NextResponse.json({ error: 'Menu item not found' }, { status: 404 });
    }

    await prisma.menuItem.update({
      where: { id: params.id },
      data: { active: false },
    });
    // Its ficha simples, if no other item uses it, leaves the Fichas técnicas list and the reports
    await retireProductRecipe(prisma, restaurantId, existingItem.recipeId);
    // Its photo goes too; a storage hiccup must not fail the delete
    try {
      await removeProductPhoto(restaurantId, params.id);
    } catch (e) {
      console.error('[cardapio] photo remove failed:', e);
    }

    return NextResponse.json({ message: 'Menu item deleted' });
  } catch (error) {
    console.error('Error deleting menu item:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
