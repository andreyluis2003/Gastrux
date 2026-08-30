// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    let onboarding = await prisma.userOnboarding.findUnique({
      where: { userId },
    });

    // If no onboarding record, create one
    if (!onboarding) {
      onboarding = await prisma.userOnboarding.create({
        data: { userId },
      });
    }

    // Calculate completion percentage
    const completionItems = [
      onboarding.defaultCategoriesCreated,
      onboarding.exampleRecipeCreated,
      onboarding.ingredientAdded,
      onboarding.recipeCreated,
      onboarding.productionPlanCreated,
      onboarding.stockMovementRecorded,
    ];

    const completionPercentage = Math.round(
      (completionItems.filter(Boolean).length / completionItems.length) * 100
    );

    return NextResponse.json({
      ...onboarding,
      completionPercentage,
      isCompleted: onboarding.completedAt !== null,
      isSkipped: onboarding.skippedAt !== null,
    });
  } catch (error) {
    console.error('Error fetching onboarding status:', error);
    return NextResponse.json(
      { error: 'Erro ao obter status do onboarding' },
      { status: 500 }
    );
  }
}
