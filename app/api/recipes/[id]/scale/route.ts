import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { MANAGER_ROLES, isManager, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { scaleRecipe } from '@/lib/recipes/scale';

export const dynamic = 'force-dynamic';

const MAX_PORTIONS = 100000;

/**
 * POST /api/recipes/[id]/scale { quantity } - Escalonar receita (2026-10-19): the insumos of N portions of a ficha
 * técnica and whether the stock has them. Owner, manager and cook (the cook separates the insumos); the cost only
 * for owner and manager, like the other cost screens.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole([...MANAGER_ROLES, 'COOK'], 'Escalonar receita é da cozinha, do dono e do gerente');
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({}));
  const portions = Number(body?.quantity);
  if (body?.quantity === null || !Number.isFinite(portions) || portions <= 0 || portions > MAX_PORTIONS) {
    return NextResponse.json({ error: `Informe uma quantidade de porções entre 0 e ${MAX_PORTIONS}` }, { status: 400 });
  }
  const restaurantId = auth.member.restaurantId;
  const recipe = await prisma.recipe.findFirst({
    where: { id: params.id, restaurantId },
    select: {
      name: true, baseYield: true, yieldUnit: true,
      ingredients: {
        select: { ingredientId: true, quantity: true, unit: true, ingredient: { select: { name: true, referenceCost: true, standardUnit: true, conversionFactor: true } } },
        orderBy: { ingredient: { name: 'asc' } },
      },
    },
  });
  if (!recipe) return NextResponse.json({ error: 'Ficha técnica não encontrada' }, { status: 404 });
  const stocks = await prisma.stock.findMany({
    where: { restaurantId, ingredientId: { in: recipe.ingredients.map((i) => i.ingredientId) } },
    select: { ingredientId: true, currentQuantity: true },
  });
  const scaled = scaleRecipe(recipe, portions, new Map(stocks.map((s) => [s.ingredientId, s.currentQuantity])));
  const base = { recipeName: recipe.name, baseYield: recipe.baseYield, yieldUnit: recipe.yieldUnit, portions, factor: scaled.factor };
  const out = isManager(auth.member)
    ? { ...base, lines: scaled.lines, totalCost: scaled.totalCost, missingCost: scaled.missingCost }
    : { ...base, lines: scaled.lines.map(({ cost, ...line }) => line) };
  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } });
}
