// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });

  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return NextResponse.json({ items: [] });

  const { searchParams } = new URL(req.url);
  const programId = searchParams.get('programId');
  const where: any = { program: { restaurantId } };
  if (programId) where.programId = programId;

  const items = await prisma.loyaltyMilestone.findMany({
    where,
    orderBy: { orderCount: 'asc' },
    include: {
      program: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!session || !['OWNER', 'MANAGER', 'ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
  }

  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });

  const body = await req.json();
  const { programId, name, description, orderCount, bonusPoints, discountPercent, freeItem, active, notifyCustomer } = body;

  if (!programId || !name || orderCount == null) {
    return NextResponse.json({ error: 'Campos obrigatorios: programId, name, orderCount' }, { status: 400 });
  }

  const program = await prisma.loyaltyProgram.findFirst({ where: { id: programId, restaurantId }, select: { id: true } });
  if (!program) {
    return NextResponse.json({ error: 'Programa de fidelidade não encontrado' }, { status: 404 });
  }

  try {
    const milestone = await prisma.loyaltyMilestone.create({
      data: {
        programId,
        name,
        description: description || null,
        orderCount: Number(orderCount),
        bonusPoints: Number(bonusPoints || 0),
        discountPercent: discountPercent != null ? Number(discountPercent) : null,
        freeItem: freeItem || null,
        active: active !== false,
        notifyCustomer: notifyCustomer !== false,
      },
    });
    return NextResponse.json({ milestone });
  } catch (e: any) {
    if (e.code === 'P2002') {
      return NextResponse.json({ error: 'Já existe um marco para esse número de pedidos' }, { status: 409 });
    }
    console.error('[loyalty/milestones]', e);
    return NextResponse.json({ error: 'Erro ao criar marco' }, { status: 500 });
  }
}
