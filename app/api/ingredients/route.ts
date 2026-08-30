// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCacheHeader } from '@/lib/cache-headers';
import { safeHandler } from '@/lib/api/safe-handler';
import { ApiErrors } from '@/lib/api/api-response';

export const dynamic = 'force-dynamic';

/**
 * @swagger
 * /api/ingredients:
 *   get:
 *     tags:
 *       - Ingredients
 *     summary: Listar ingredientes
 *     description: Retorna todos os ingredientes ativos do restaurante do usuário autenticado
 *     security:
 *       - sessionAuth: []
 *     responses:
 *       200:
 *         description: Lista de ingredientes
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Ingredient'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *   post:
 *     tags:
 *       - Ingredients
 *     summary: Criar novo ingrediente
 *     description: Cria um novo ingrediente no restaurante (requer role ADMIN, MANAGER ou OWNER)
 *     security:
 *       - sessionAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Ingredient'
 *     responses:
 *       201:
 *         description: Ingrediente criado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Ingredient'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
export const GET = safeHandler(async (req, context) => {
  const ingredients = await prisma.ingredient.findMany({
    where: {
      restaurantId: context.restaurantId,
      active: true,
    },
    include: { category: true, suppliers: true, currentStock: true },
  });

  const response = NextResponse.json(ingredients);
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

  // Tier enforcement — check ingredient limit
  const { enforceResourceLimit } = await import('@/lib/api/tier-middleware');
  const tierBlock = await enforceResourceLimit(context.restaurantId, 'ingredients');
  if (tierBlock) return tierBlock;

  const body = await req.json();
  
  // Validate required fields
  if (!body.code || !body.name) {
    return ApiErrors.INVALID_REQUEST({
      message: 'code and name are required',
    });
  }

  const ingredient = await prisma.ingredient.create({
    data: {
      code: body.code,
      name: body.name,
      description: body.description,
      categoryId: body.categoryId,
      standardUnit: body.standardUnit,
      purchaseUnit: body.purchaseUnit,
      conversionFactor: body.conversionFactor || 1,
      minimumStock: body.minimumStock || 0,
      referenceCost: body.referenceCost || 0,
      restaurantId: context.restaurantId,
    },
    include: { category: true },
  });

  // Create stock entry
  await prisma.stock.create({
    data: {
      ingredientId: ingredient.id,
      currentQuantity: 0,
      restaurantId: context.restaurantId,
    },
  });

  // Log audit
  await prisma.auditLog.create({
    data: {
      userId: context.userId,
      action: 'CREATE',
      entityType: 'Ingredient',
      entityId: ingredient.id,
      restaurantId: context.restaurantId,
      changes: JSON.stringify(ingredient),
    },
  });

  return NextResponse.json(ingredient, { status: 201 });
});
