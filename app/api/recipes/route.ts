// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCacheHeader } from '@/lib/cache-headers';
import { safeHandler } from '@/lib/api/safe-handler';
import { ApiErrors } from '@/lib/api/api-response';

export const dynamic = 'force-dynamic';

/**
 * @swagger
 * /api/recipes:
 *   get:
 *     tags:
 *       - Recipes
 *     summary: Listar receitas
 *     description: Retorna todas as receitas ativas do restaurante com ingredientes incluídos
 *     security:
 *       - sessionAuth: []
 *     responses:
 *       200:
 *         description: Lista de receitas
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Recipe'
 *   post:
 *     tags:
 *       - Recipes
 *     summary: Criar nova receita
 *     security:
 *       - sessionAuth: []
 *     responses:
 *       201:
 *         description: Receita criada
 */
export const GET = safeHandler(async (req, context) => {
  const recipes = await prisma.recipe.findMany({
    where: {
      restaurantId: context.restaurantId,
      active: true,
    },
    include: { ingredients: { include: { ingredient: true } } },
  });

  const response = NextResponse.json(recipes);
  const cacheHeaders = getCacheHeader('medium');
  Object.entries(cacheHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
});

export const POST = safeHandler(async (req, context) => {
  if (context.role === 'COOK') {
    return ApiErrors.FORBIDDEN();
  }

  // Tier enforcement — check recipe limit
  const { enforceResourceLimit } = await import('@/lib/api/tier-middleware');
  const tierBlock = await enforceResourceLimit(context.restaurantId, 'recipes');
  if (tierBlock) return tierBlock;

  const body = await req.json();
  
  if (!body.code || !body.name) {
    return ApiErrors.INVALID_REQUEST({
      message: 'code and name are required',
    });
  }

  const recipe = await prisma.recipe.create({
    data: {
      code: body.code,
      name: body.name,
      description: body.description,
      baseYield: body.baseYield,
      yieldUnit: body.yieldUnit,
      portionSize: body.portionSize,
      portionUnit: body.portionUnit,
      prepTimeMinutes: body.prepTimeMinutes || 0,
      yieldLossFactor: body.yieldLossFactor || 0,
      restaurantId: context.restaurantId,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: context.userId,
      action: 'CREATE',
      entityType: 'Recipe',
      entityId: recipe.id,
      restaurantId: context.restaurantId,
      changes: JSON.stringify(recipe),
    },
  });

  return NextResponse.json(recipe, { status: 201 });
});
