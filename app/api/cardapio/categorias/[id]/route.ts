import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';

export const dynamic = 'force-dynamic';

// Rename or remove a menu category (owner request 2026-11-14: "Yakisoba" had to become "Massas")

async function ownCategory(id: string) {
  const managerCheck = await requireRestaurantRole(MANAGER_ROLES, 'Alterar o cardápio exige um gerente');
  if (!managerCheck.ok) return { response: managerCheck.response };
  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return { response: NextResponse.json({ error: 'Restaurante não identificado' }, { status: 400 }) };
  const category = await prisma.menuCategory.findFirst({ where: { id, restaurantId, active: true }, select: { id: true } });
  if (!category) return { response: NextResponse.json({ error: 'Categoria não encontrada' }, { status: 404 }) };
  return { category };
}

/** PATCH { name, emoji? } */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const own = await ownCategory(params.id);
  if ('response' in own) return own.response;
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'Informe o nome da categoria' }, { status: 400 });
  if (name.length > 60) return NextResponse.json({ error: 'Nome muito longo (até 60 letras)' }, { status: 400 });
  const data: { name: string; emoji?: string | null } = { name };
  if (body && 'emoji' in body) data.emoji = typeof body.emoji === 'string' && body.emoji.trim() ? body.emoji.trim().slice(0, 8) : null;
  const updated = await prisma.menuCategory.update({ where: { id: params.id }, data });
  return NextResponse.json(updated);
}

/** DELETE: only an empty category; it is hidden (active = false), so old products and reports keep their link */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const own = await ownCategory(params.id);
  if ('response' in own) return own.response;
  const products = await prisma.menuItem.count({ where: { categoryId: params.id, active: true } });
  if (products > 0) {
    return NextResponse.json(
      { error: `A categoria ainda tem ${products} ${products === 1 ? 'produto' : 'produtos'}. Mude os produtos de categoria antes de apagar.` },
      { status: 409 }
    );
  }
  await prisma.menuCategory.update({ where: { id: params.id }, data: { active: false } });
  return NextResponse.json({ ok: true });
}
