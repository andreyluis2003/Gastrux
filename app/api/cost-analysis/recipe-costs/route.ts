// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '30');
    const recipeIds = searchParams.get('recipeIds')?.split(',').filter(Boolean) || [];

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get all recipes (or specific ones if provided)
    const recipes = await prisma.recipe.findMany({
      where: recipeIds.length > 0 ? { id: { in: recipeIds } } : {},
      include: {
        ingredients: {
          include: { ingredient: true },
        },
      },
    });

    // Calculate recipe costs based on latest price trends
    const recipeCosts = await Promise.all(
      recipes.map(async (recipe) => {
        let totalCost = 0;
        const ingredientCosts: any[] = [];

        // Calculate cost for each ingredient in the recipe
        for (const recipeIng of recipe.ingredients) {
          // Get latest price trend for this ingredient
          const latestPriceTrend = await prisma.priceTrend.findFirst({
            where: {
              ingredientId: recipeIng.ingredientId,
              recordedDate: {
                lte: endDate,
              },
            },
            orderBy: { recordedDate: 'desc' },
          });

          const price = latestPriceTrend?.price || recipeIng.ingredient.referenceCost;
          const ingredientCost = recipeIng.quantity * price;
          totalCost += ingredientCost;

          ingredientCosts.push({
            ingredientId: recipeIng.ingredientId,
            name: recipeIng.ingredient.name,
            quantity: recipeIng.quantity,
            unit: recipeIng.unit,
            price,
            cost: ingredientCost,
          });
        }

        // Get all historical costs for this recipe from price trends
        const allInvoiceItems = await prisma.priceTrend.findMany({
          where: {
            recordedDate: {
              gte: startDate,
              lte: endDate,
            },
            ingredient: {
              recipeIngredients: {
                some: { recipeId: recipe.id },
              },
            },
          },
          include: { ingredient: true },
        });

        // Calculate average cost over time
        const costPerPortion = totalCost / (recipe.portionSize || 1);

        return {
          recipeId: recipe.id,
          code: recipe.code,
          name: recipe.name,
          baseYield: recipe.baseYield,
          yieldUnit: recipe.yieldUnit,
          portionSize: recipe.portionSize,
          portionUnit: recipe.portionUnit,
          totalCost,
          costPerPortion,
          prepTimeMinutes: recipe.prepTimeMinutes,
          ingredientCount: recipe.ingredients.length,
          ingredientCosts,
        };
      })
    );

    return NextResponse.json({
      period: { startDate, endDate, days },
      count: recipeCosts.length,
      data: recipeCosts.sort((a, b) => b.totalCost - a.totalCost),
    });
  } catch (error) {
    console.error('Error fetching recipe costs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch recipe costs' },
      { status: 500 }
    );
  }
}
