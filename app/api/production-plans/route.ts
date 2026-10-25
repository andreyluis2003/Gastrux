// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { safeHandler } from '@/lib/api/safe-handler';
import { ApiErrors } from '@/lib/api/api-response';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';
import { withoutCost } from '@/lib/production-plans/view';
import { planDay } from '@/lib/production-plans/plan-day';
import { MANAGER_ROLES, getRestaurantMember, isManager, requireRestaurantRole } from '@/lib/auth/restaurant-role';

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
    // The cook reads the plans; changes and costs are the owner's and the manager's (as on Escalonar receita)
    const me = await getRestaurantMember();
    const canManage = !!me && isManager(me);
    return NextResponse.json({ plans: canManage ? plans : plans.map(withoutCost), canManage });
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
  
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  // The role in THIS restaurant: the global session role let a cashier (and an owner elsewhere who cooks here) change plans
  const gate = await requireRestaurantRole(MANAGER_ROLES, 'Só o dono e o gerente mudam o planejamento de produção');
  if (!gate.ok) return gate.response;

  try {
    const body = await req.json();
    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não selecionado' }, { status: 400 });
    }

    const plan = await prisma.productionPlan.create({
      data: {
        restaurantId,
        planDate: planDay(body.planDate),
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
