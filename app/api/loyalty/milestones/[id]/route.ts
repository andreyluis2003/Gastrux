// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!session || !['OWNER', 'MANAGER', 'ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
  }

  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });

  const owned = await prisma.loyaltyMilestone.findFirst({ where: { id: params.id, program: { restaurantId } }, select: { id: true } });
  if (!owned) return NextResponse.json({ error: 'Marco não encontrado' }, { status: 404 });

  const body = await req.json();
  const data: any = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.description !== undefined) data.description = body.description || null;
  if (body.orderCount !== undefined) data.orderCount = Number(body.orderCount);
  if (body.bonusPoints !== undefined) data.bonusPoints = Number(body.bonusPoints || 0);
  if (body.discountPercent !== undefined) data.discountPercent = body.discountPercent != null ? Number(body.discountPercent) : null;
  if (body.freeItem !== undefined) data.freeItem = body.freeItem || null;
  if (typeof body.active === 'boolean') data.active = body.active;
  if (typeof body.notifyCustomer === 'boolean') data.notifyCustomer = body.notifyCustomer;

  try {
    const updated = await prisma.loyaltyMilestone.update({ where: { id: params.id }, data });
    return NextResponse.json({ milestone: updated });
  } catch (e: any) {
    console.error('[loyalty/milestones/id PATCH]', e);
    return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!session || !['OWNER', 'MANAGER', 'ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
  }

  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });

  const owned = await prisma.loyaltyMilestone.findFirst({ where: { id: params.id, program: { restaurantId } }, select: { id: true } });
  if (!owned) return NextResponse.json({ error: 'Marco não encontrado' }, { status: 404 });

  try {
    await prisma.loyaltyMilestone.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('[loyalty/milestones/id DELETE]', e);
    return NextResponse.json({ error: 'Erro ao excluir' }, { status: 500 });
  }
}
