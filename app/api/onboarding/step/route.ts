// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const { action, module } = await request.json();

    let updateData: any = {};

    // Handle different actions
    switch (action) {
      case 'view_module':
        // Track which modules have been viewed
        const onboarding = await prisma.userOnboarding.findUnique({
          where: { userId },
        });

        if (onboarding) {
          const viewed = onboarding.modulesViewed
            ? onboarding.modulesViewed.split(',')
            : [];
          if (!viewed.includes(module)) {
            viewed.push(module);
          }
          updateData.modulesViewed = viewed.join(',');
        }
        break;

      case 'ingredient_added':
        updateData.ingredientAdded = true;
        break;

      case 'recipe_created':
        updateData.recipeCreated = true;
        break;

      case 'production_plan_created':
        updateData.productionPlanCreated = true;
        break;

      case 'stock_movement_recorded':
        updateData.stockMovementRecorded = true;
        break;

      case 'next_step':
        const current = await prisma.userOnboarding.findUnique({
          where: { userId },
        });
        if (current) {
          updateData.currentStep = current.currentStep + 1;
        }
        break;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'Ação inválida' },
        { status: 400 }
      );
    }

    const updated = await prisma.userOnboarding.update({
      where: { userId },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating onboarding step:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar etapa do onboarding' },
      { status: 500 }
    );
  }
}
