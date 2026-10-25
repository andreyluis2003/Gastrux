// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { safeHandler } from '@/lib/api/safe-handler';
import { ApiErrors } from '@/lib/api/api-response';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';
import { withoutCost } from '@/lib/production-plans/view';
import { MANAGER_ROLES, getRestaurantMember, isManager, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { withLiveCost } from '@/lib/recipes/cost-map';
import { planDay } from '@/lib/production-plans/plan-day';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não selecionado' }, { status: 400 });
    }

    const plan = await prisma.productionPlan.findFirst({
      where: { id: params.id, restaurantId },
      include: {
        items: {
          include: {
            recipe: true,
          },
        },
      },
    });

    if (!plan) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const me = await getRestaurantMember();
    const canManage = !!me && isManager(me);
    return NextResponse.json({ ...(canManage ? plan : withoutCost(plan)), canManage });
  } catch (error) {
    console.error('Error fetching production plan:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // The role in THIS restaurant: the global session role let a cashier (and an owner elsewhere who cooks here) change plans
    const gate = await requireRestaurantRole(MANAGER_ROLES, 'Só o dono e o gerente mudam o planejamento de produção');
    if (!gate.ok) return gate.response;

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não selecionado' }, { status: 400 });
    }

    const owned = await prisma.productionPlan.findFirst({ where: { id: params.id, restaurantId }, select: { id: true } });
    if (!owned) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const body = await request.json();
    const { planDate, notes, status } = body;

    const updateData: any = {};
    if (planDate !== undefined) updateData.planDate = planDay(planDate);
    if (notes !== undefined) updateData.notes = notes;
    if (status !== undefined) updateData.status = status;

    const plan = await prisma.productionPlan.update({
      where: { id: params.id },
      data: updateData,
      include: {
        items: {
          include: {
            recipe: true,
          },
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'UPDATE',
        entityType: 'ProductionPlan',
        entityId: plan.id,
        changes: JSON.stringify(updateData),
      },
    });

    return NextResponse.json(plan);
  } catch (error) {
    console.error('Error updating production plan:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // The role in THIS restaurant: the global session role let a cashier (and an owner elsewhere who cooks here) change plans
    const gate = await requireRestaurantRole(MANAGER_ROLES, 'Só o dono e o gerente mudam o planejamento de produção');
    if (!gate.ok) return gate.response;

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não selecionado' }, { status: 400 });
    }

    // Verificar que o plano pertence ao restaurante do usuário
    const owned = await prisma.productionPlan.findFirst({ where: { id: params.id, restaurantId }, select: { id: true } });
    if (!owned) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const body = await request.json();
    const { recipeId, quantity, notes } = body;

    if (!recipeId || !quantity) {
      return NextResponse.json(
        { error: 'recipeId e quantity sao obrigatorios' },
        { status: 400 }
      );
    }

    // Buscar a receita (escopada ao restaurante) para calcular o custo estimado
    const recipe = await prisma.recipe.findFirst({
      where: { id: recipeId, restaurantId },
    });

    if (!recipe) {
      return NextResponse.json({ error: 'Receita não encontrada' }, { status: 404 });
    }

    // The cost of each ficha now, from its insumos (the stored costPerPortion was never written, 2026-10-19)
    if (restaurantId) await withLiveCost(restaurantId, [recipe]);
    const estimatedCost = recipe.costPerPortion * parseFloat(quantity);

    const item = await prisma.productionPlanItem.create({
      data: {
        restaurantId,
        planId: params.id,
        recipeId: recipeId,
        quantity: parseFloat(quantity),
        estimatedCost: estimatedCost,
        notes: notes || null,
      },
      include: {
        recipe: true,
      },
    });

    // Recalcular custo total do plano
    const totalCost = await prisma.productionPlanItem.aggregate({
      where: { planId: params.id },
      _sum: { estimatedCost: true },
    });

    await prisma.productionPlan.update({
      where: { id: params.id },
      data: { totalCost: totalCost._sum.estimatedCost || 0 },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'CREATE',
        entityType: 'ProductionPlanItem',
        entityId: item.id,
        changes: JSON.stringify({ recipeId, quantity, estimatedCost }),
      },
    });

    return NextResponse.json(item);
  } catch (error) {
    console.error('Error adding item to production plan:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // The role in THIS restaurant: the global session role let a cashier (and an owner elsewhere who cooks here) change plans
    const gate = await requireRestaurantRole(MANAGER_ROLES, 'Só o dono e o gerente mudam o planejamento de produção');
    if (!gate.ok) return gate.response;

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não selecionado' }, { status: 400 });
    }

    const owned = await prisma.productionPlan.findFirst({ where: { id: params.id, restaurantId }, select: { id: true } });
    if (!owned) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await prisma.productionPlan.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting production plan:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
