import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { MANAGER_ROLES, recordAudit, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { normalizeProductFiscalFields, validateProductFiscalFields } from '@/lib/nfe/fiscal-data';

export const dynamic = 'force-dynamic';

/**
 * PUT /api/recipes/[id]/fiscal - the product's own fiscal data on the NFC-e (NCM, CEST, CFOP,
 * origin, CSOSN), set by the accountant or a manager. Empty fields fall back to the restaurant
 * defaults. Every change is recorded with the old and new values.
 */
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(MANAGER_ROLES, 'Alterar dados fiscais exige um gerente');
  if (!auth.ok) return auth.response;
  const { member } = auth;

  const body = await request.json().catch(() => ({}));
  const problems = validateProductFiscalFields(body ?? {});
  if (problems.length) return NextResponse.json({ error: problems.join('; '), problems }, { status: 400 });

  const recipe = await prisma.recipe.findFirst({
    where: { id: params.id, restaurantId: member.restaurantId },
    select: { id: true, name: true, fiscalNcm: true, fiscalCest: true, fiscalCfop: true, fiscalOrigin: true, fiscalCsosn: true },
  });
  if (!recipe) return NextResponse.json({ error: 'Receita não encontrada' }, { status: 404 });

  const data = normalizeProductFiscalFields(body ?? {});
  const updated = await prisma.recipe.update({
    where: { id: recipe.id },
    data,
    select: { id: true, name: true, fiscalNcm: true, fiscalCest: true, fiscalCfop: true, fiscalOrigin: true, fiscalCsosn: true },
  });

  const { id: _id, name, ...before } = recipe;
  await recordAudit(member, {
    action: 'UPDATE',
    entityType: 'Recipe',
    entityId: recipe.id,
    changes: { field: 'fiscal', recipe: name, from: before, to: data },
  });

  return NextResponse.json(updated);
}
