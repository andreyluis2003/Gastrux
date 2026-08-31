// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcryptjs from 'bcryptjs';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

// Default ingredient categories for Brazil
const DEFAULT_CATEGORIES = [
  { name: 'Carnes', color: '#EF4444' },
  { name: 'Peixes', color: '#3B82F6' },
  { name: 'Verduras', color: '#10B981' },
  { name: 'Frutas', color: '#F59E0B' },
  { name: 'Laticínios', color: '#8B5CF6' },
  { name: 'Grãos', color: '#D97706' },
  { name: 'Condimentos', color: '#EC4899' },
  { name: 'Óleos', color: '#F97316' },
  { name: 'Bebidas', color: '#06B6D4' },
];

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 400 });
    }

    // Check if user already has onboarding started
    let onboarding = await prisma.userOnboarding.findUnique({
      where: { userId },
    });

    if (onboarding) {
      return NextResponse.json(onboarding);
    }

    // Create onboarding record
    onboarding = await prisma.userOnboarding.create({
      data: {
        userId,
      },
    });

    // Create default categories
    for (const category of DEFAULT_CATEGORIES) {
      await prisma.ingredientCategory.upsert({
        where: { restaurantId_name: { restaurantId, name: category.name } },
        update: {},
        create: {
          restaurantId,
          name: category.name,
          color: category.color,
        },
      });
    }

    // Create example recipe with example ingredients
    const vegetaisCategory = await prisma.ingredientCategory.findUnique({
      where: { restaurantId_name: { restaurantId, name: 'Verduras' } },
    });

    const graosCategory = await prisma.ingredientCategory.findUnique({
      where: { restaurantId_name: { restaurantId, name: 'Grãos' } },
    });

    const oleoCategory = await prisma.ingredientCategory.findUnique({
      where: { restaurantId_name: { restaurantId, name: 'Óleos' } },
    });

    const condimentosCategory = await prisma.ingredientCategory.findUnique({
      where: { restaurantId_name: { restaurantId, name: 'Condimentos' } },
    });

    // Create example ingredients
    const arrozId = await createOrGetIngredient(
      restaurantId,
      'ARR001',
      'Arroz Integral',
      'Arroz integral orgânico',
      graosCategory!.id,
      10.0
    );

    const feijaoId = await createOrGetIngredient(
      restaurantId,
      'FEI001',
      'Feijão Carioca',
      'Feijão carioca seco',
      graosCategory!.id,
      8.0
    );

    const cebolId = await createOrGetIngredient(
      restaurantId,
      'CEB001',
      'Cebola',
      'Cebola roxa',
      vegetaisCategory!.id,
      3.0
    );

    const alhoId = await createOrGetIngredient(
      restaurantId,
      'ALH001',
      'Alho',
      'Alho fresco descascado',
      vegetaisCategory!.id,
      15.0
    );

    const oleoId = await createOrGetIngredient(
      restaurantId,
      'OLE001',
      'Óleo de Soja',
      'Óleo de soja refinado',
      oleoCategory!.id,
      5.5
    );

    const salId = await createOrGetIngredient(
      restaurantId,
      'SAL001',
      'Sal',
      'Sal fino',
      condimentosCategory!.id,
      2.0
    );

    // Create example recipe
    const recipe = await prisma.recipe.upsert({
      where: { restaurantId_code: { restaurantId, code: 'REC001' } },
      update: {},
      create: {
        restaurantId,
        code: 'REC001',
        name: 'Arroz com Feijão',
        description: 'Receita clássica brasileira com arroz integral e feijão carioca',
        baseYield: 10,
        yieldUnit: 'un',
        portionSize: 1,
        portionUnit: 'un',
        prepTimeMinutes: 45,
        yieldLossFactor: 0.05,
        ingredients: {
          create: [
            {
              ingredientId: arrozId,
              quantity: 2,
              unit: 'kg',
              notes: 'Arroz cru',
            },
            {
              ingredientId: feijaoId,
              quantity: 1.5,
              unit: 'kg',
              notes: 'Feijão cru (rende ~4kg cozido)',
            },
            {
              ingredientId: cebolId,
              quantity: 0.5,
              unit: 'kg',
              notes: 'Cebolinha picada',
            },
            {
              ingredientId: alhoId,
              quantity: 100,
              unit: 'g',
              notes: 'Alho picado',
            },
            {
              ingredientId: oleoId,
              quantity: 200,
              unit: 'ml',
              notes: 'Para refogado',
            },
            {
              ingredientId: salId,
              quantity: 50,
              unit: 'g',
              notes: 'A gosto',
            },
          ],
        },
      },
    });

    // Update onboarding
    onboarding = await prisma.userOnboarding.update({
      where: { userId },
      data: {
        defaultCategoriesCreated: true,
        exampleRecipeCreated: true,
      },
    });

    return NextResponse.json({
      onboarding,
      message: 'Onboarding iniciado com sucesso. Categorias padrão e receita de exemplo criadas.',
    });
  } catch (error) {
    console.error('Onboarding error:', error);
    return NextResponse.json(
      { error: 'Erro ao iniciar onboarding' },
      { status: 500 }
    );
  }
}

async function createOrGetIngredient(
  restaurantId: string,
  code: string,
  name: string,
  description: string,
  categoryId: string,
  referenceCost: number
): Promise<string> {
  const ingredient = await prisma.ingredient.upsert({
    where: { restaurantId_code: { restaurantId, code } },
    update: {},
    create: {
      restaurantId,
      code,
      name,
      description,
      categoryId,
      standardUnit: 'kg',
      purchaseUnit: 'kg',
      conversionFactor: 1.0,
      minimumStock: 0.5,
      referenceCost,
    },
  });

  // Create stock entry if it doesn't exist
  await prisma.stock.upsert({
    where: { restaurantId_ingredientId: { restaurantId, ingredientId: ingredient.id } },
    update: {},
    create: {
      restaurantId,
      ingredientId: ingredient.id,
      currentQuantity: 0,
    },
  });

  return ingredient.id;
}
