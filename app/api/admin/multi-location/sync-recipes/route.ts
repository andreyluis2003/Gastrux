// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

async function getUserRestaurantIds(userId: string) {
  const urs = await prisma.restaurantUser.findMany({
    where: { userId, isActive: true },
    select: { restaurantId: true, restaurant: { select: { id: true, name: true } } },
  });
  return urs;
}

// GET: List recipes from source restaurant for sync
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const userId = (session.user as any).id;

    const urs = await getUserRestaurantIds(userId);
    if (urs.length < 2) {
      return NextResponse.json({ error: 'Necessário ter pelo menos 2 unidades', restaurants: [] }, { status: 200 });
    }

    const sourceId = req.nextUrl.searchParams.get('sourceId');
    if (!sourceId || !urs.find(u => u.restaurantId === sourceId)) {
      return NextResponse.json({
        restaurants: urs.map(u => u.restaurant),
        recipes: [],
      });
    }

    const recipes = await prisma.recipe.findMany({
      where: { restaurantId: sourceId, active: true },
      select: {
        id: true, name: true, code: true, description: true,
        baseYield: true, baseYieldUnit: true, prepTimeMinutes: true,
        sellingPrice: true, costPerServing: true,
        ingredients: {
          select: {
            quantity: true, unit: true,
            ingredient: { select: { id: true, name: true, code: true, unit: true, referenceCost: true, categoryId: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({
      restaurants: urs.map(u => u.restaurant),
      recipes,
      sourceId,
    });
  } catch (error) {
    console.error('Sync recipes GET error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// POST: Sync selected recipes to target restaurant
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const userId = (session.user as any).id;

    const urs = await getUserRestaurantIds(userId);
    const body = await req.json();
    const { sourceId, targetId, recipeIds } = body;

    if (!sourceId || !targetId || !recipeIds?.length) {
      return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 });
    }
    if (sourceId === targetId) {
      return NextResponse.json({ error: 'Origem e destino devem ser diferentes' }, { status: 400 });
    }
    if (!urs.find(u => u.restaurantId === sourceId) || !urs.find(u => u.restaurantId === targetId)) {
      return NextResponse.json({ error: 'Sem acesso a uma das unidades' }, { status: 403 });
    }

    // Fetch source recipes with ingredients
    const sourceRecipes = await prisma.recipe.findMany({
      where: { id: { in: recipeIds }, restaurantId: sourceId },
      include: {
        ingredients: {
          include: {
            ingredient: { select: { name: true, code: true, unit: true, referenceCost: true, categoryId: true, category: { select: { name: true } } } },
          },
        },
      },
    });

    let synced = 0;
    let skipped = 0;
    const details: string[] = [];

    for (const recipe of sourceRecipes) {
      // Check if recipe already exists in target (by code)
      const existing = await prisma.recipe.findFirst({
        where: { restaurantId: targetId, code: recipe.code },
      });

      if (existing) {
        skipped++;
        details.push(`"${recipe.name}" já existe no destino (código ${recipe.code})`);
        continue;
      }

      // Ensure ingredients exist in target
      const ingredientMap: Record<string, string> = {};
      for (const ri of recipe.ingredients) {
        const srcIng = ri.ingredient;
        // Find or create ingredient in target
        let targetIng = await prisma.ingredient.findFirst({
          where: { restaurantId: targetId, code: srcIng.code },
        });

        if (!targetIng) {
          // Find or create category in target
          let targetCategory = null;
          if (srcIng.category?.name) {
            targetCategory = await prisma.ingredientCategory.findFirst({
              where: { restaurantId: targetId, name: srcIng.category.name },
            });
            if (!targetCategory) {
              targetCategory = await prisma.ingredientCategory.create({
                data: { restaurantId: targetId, name: srcIng.category.name },
              });
            }
          }

          targetIng = await prisma.ingredient.create({
            data: {
              restaurantId: targetId,
              name: srcIng.name,
              code: srcIng.code,
              unit: srcIng.unit,
              referenceCost: srcIng.referenceCost,
              categoryId: targetCategory?.id || srcIng.categoryId,
              active: true,
            },
          });
        }
        ingredientMap[ri.ingredient.code] = targetIng.id;
      }

      // Create recipe in target
      await prisma.recipe.create({
        data: {
          restaurantId: targetId,
          name: recipe.name,
          code: recipe.code,
          description: recipe.description,
          baseYield: recipe.baseYield,
          baseYieldUnit: recipe.baseYieldUnit,
          prepTimeMinutes: recipe.prepTimeMinutes,
          sellingPrice: recipe.sellingPrice,
          costPerServing: recipe.costPerServing,
          active: true,
          ingredients: {
            create: recipe.ingredients.map(ri => ({
              ingredientId: ingredientMap[ri.ingredient.code] || ri.ingredient.id,
              quantity: ri.quantity,
              unit: ri.unit,
            })),
          },
        },
      });

      synced++;
      details.push(`"${recipe.name}" sincronizada com sucesso`);
    }

    return NextResponse.json({
      synced,
      skipped,
      total: sourceRecipes.length,
      details,
    });
  } catch (error) {
    console.error('Sync recipes POST error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
