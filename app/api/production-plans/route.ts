// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { safeHandler } from '@/lib/api/safe-handler';
import { ApiErrors } from '@/lib/api/api-response';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) {
    return NextResponse.json({ error: 'Restaurante não selecionado' }, { status: 400 });
  }

  try {
    const plans = await prisma.productionPlan.findMany({
      where: { restaurantId },
      include: { items: { include: { recipe: true } } },
      orderBy: { planDate: 'desc' },
    });
    return NextResponse.json(plans);
  } catch (error) {
    console.error('Error fetching plans:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar planos' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  
  if (!session?.user || (user?.role === 'COOK')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não selecionado' }, { status: 400 });
    }

    const plan = await prisma.productionPlan.create({
      data: {
        restaurantId,
        planDate: new Date(body.planDate),
        notes: body.notes || '',
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'CREATE',
        entityType: 'ProductionPlan',
        entityId: plan.id,
        changes: JSON.stringify(plan),
      },
    });

    return NextResponse.json(
      {
        ...plan,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating plan:', error);
    return NextResponse.json(
      { error: 'Erro ao criar plano' },
      { status: 500 }
    );
  }
}
