// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { MANAGER_ROLES, recordAudit, requireRestaurantRole } from '@/lib/auth/restaurant-role';

export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Prices are a manager decision (market practice), recorded with the old and new value
    const auth = await requireRestaurantRole(MANAGER_ROLES, 'Alterar preço exige um gerente');
    if (!auth.ok) return auth.response;
    const { member } = auth;

    const { sellingPrice } = await req.json();
    const price = Number(sellingPrice);
    if (sellingPrice === null || sellingPrice === undefined || !Number.isFinite(price) || price < 0) {
      return NextResponse.json({ error: 'Preço inválido: informe um valor maior ou igual a zero' }, { status: 400 });
    }

    const owned = await prisma.recipe.findFirst({
      where: { id: params.id, restaurantId: member.restaurantId },
      select: { id: true, name: true, sellingPrice: true },
    });
    if (!owned) {
      return NextResponse.json({ error: 'Receita não encontrada' }, { status: 404 });
    }

    const recipe = await prisma.recipe.update({
      where: { id: params.id },
      data: { sellingPrice: price },
    });

    if (owned.sellingPrice !== price) {
      await recordAudit(member, {
        action: 'UPDATE',
        entityType: 'Recipe',
        entityId: owned.id,
        changes: { field: 'sellingPrice', recipe: owned.name, from: owned.sellingPrice, to: price },
      });
    }

    return NextResponse.json(recipe);
  } catch (error) {
    console.error('Selling price error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar preço' }, { status: 500 });
  }
}
