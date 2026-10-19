import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { recipeCost } from '@/lib/recipes/cost';

export const dynamic = 'force-dynamic';

/**
 * GET /api/recipes/[id]/cost - the ficha shown inside the product (2026-10-18 UX research, proposal 4): its insumos,
 * the cost of one item sold and the insumos without a cost. Owner and manager, like the other cost screens.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(MANAGER_ROLES, 'Custos são do dono e do gerente');
  if (!auth.ok) return auth.response;
  const recipe = await prisma.recipe.findFirst({
    where: { id: params.id, restaurantId: auth.member.restaurantId },
    select: {
      id: true, name: true, baseYield: true,
      ingredients: {
        select: { quantity: true, unit: true, ingredient: { select: { name: true, referenceCost: true, standardUnit: true, conversionFactor: true } } },
        orderBy: { ingredient: { name: 'asc' } },
      },
    },
  });
  if (!recipe) return NextResponse.json({ error: 'Ficha técnica não encontrada' }, { status: 404 });
  return NextResponse.json(
    { recipeName: recipe.name, editHref: `/receitas/${recipe.id}`, ...recipeCost(recipe) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
