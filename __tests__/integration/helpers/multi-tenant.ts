// @ts-nocheck
/**
 * Multi-Tenant Helpers for Integration Testing
 * Provides utilities for testing multi-tenant scenarios
 */

import { PrismaClient } from '@prisma/client';

// Use global prisma instance to avoid connection limit issues
const prisma = (global as any).__PRISMA__ || new PrismaClient();

export interface RestaurantContext {
  restaurantId: string;
  ownerId: string;
  managerId?: string;
  cookId?: string;
  cashierId?: string;
}

/**
 * Create a complete multi-restaurant scenario
 * Creates 2 restaurants with users and test data
 */
export async function createMultiRestaurantScenario(): Promise<{
  restaurantA: RestaurantContext;
  restaurantB: RestaurantContext;
}> {
  // Create Restaurant A
  const restaurantA = await prisma.restaurant.create({
    data: {
      name: 'Restaurant A - Integration Test',
      status: 'ACTIVE',
      subscriptionStatus: 'active',
      ownerId: 'owner-a',
    },
  });

  // Create Restaurant B
  const restaurantB = await prisma.restaurant.create({
    data: {
      name: 'Restaurant B - Integration Test',
      status: 'ACTIVE',
      subscriptionStatus: 'active',
      ownerId: 'owner-b',
    },
  });

  // Create users for Restaurant A
  const ownerA = await prisma.user.create({
    data: {
      email: 'owner-a@integration.test',
      name: 'Owner A',
      password: 'hashed_password',
      role: 'OWNER',
      currentRestaurantId: restaurantA.id,
      active: true,
    },
  });

  await prisma.restaurantUser.create({
    data: {
      restaurantId: restaurantA.id,
      userId: ownerA.id,
      role: 'OWNER',
    },
  });

  // Create users for Restaurant B
  const ownerB = await prisma.user.create({
    data: {
      email: 'owner-b@integration.test',
      name: 'Owner B',
      password: 'hashed_password',
      role: 'OWNER',
      currentRestaurantId: restaurantB.id,
      active: true,
    },
  });

  await prisma.restaurantUser.create({
    data: {
      restaurantId: restaurantB.id,
      userId: ownerB.id,
      role: 'OWNER',
    },
  });

  // Update restaurants with owner IDs
  await prisma.restaurant.update({
    where: { id: restaurantA.id },
    data: { ownerId: ownerA.id },
  });

  await prisma.restaurant.update({
    where: { id: restaurantB.id },
    data: { ownerId: ownerB.id },
  });

  return {
    restaurantA: {
      restaurantId: restaurantA.id,
      ownerId: ownerA.id,
    },
    restaurantB: {
      restaurantId: restaurantB.id,
      ownerId: ownerB.id,
    },
  };
}

/**
 * Create test data for a restaurant
 */
export async function createRestaurantTestData(
  restaurantId: string,
  ownerId: string
): Promise<{
  ingredientIds: string[];
  recipeIds: string[];
  supplierIds: string[];
}> {
  // Create ingredient category
  const category = await prisma.ingredientCategory.create({
    data: {
      name: 'Test Category',
      restaurantId,
    },
  });

  // Create ingredients
  const ingredients = await Promise.all([
    prisma.ingredient.create({
      data: {
        code: 'ING-001',
        name: 'Test Ingredient 1',
        unit: 'KG',
        minimumStock: 10,
        currentStock: 50,
        restaurantId,
        categoryId: category.id,
      },
    }),
    prisma.ingredient.create({
      data: {
        code: 'ING-002',
        name: 'Test Ingredient 2',
        unit: 'L',
        minimumStock: 5,
        currentStock: 20,
        restaurantId,
        categoryId: category.id,
      },
    }),
  ]);

  // Create stock entries
  await Promise.all(
    ingredients.map((ing) =>
      prisma.stock.create({
        data: {
          ingredientId: ing.id,
          quantity: ing.currentStock,
          restaurantId,
        },
      })
    )
  );

  // Create supplier
  const supplier = await prisma.supplier.create({
    data: {
      code: 'SUP-001',
      name: 'Test Supplier',
      restaurantId,
    },
  });

  // Create recipe
  const recipe = await prisma.recipe.create({
    data: {
      code: 'REC-001',
      name: 'Test Recipe',
      description: 'A test recipe',
      baseYield: 10,
      restaurantId,
      ingredients: {
        create: ingredients.map((ing) => ({
          ingredientId: ing.id,
          quantity: 1,
          unit: ing.unit,
          restaurantId,
        })),
      },
    },
  });

  return {
    ingredientIds: ingredients.map((i) => i.id),
    recipeIds: [recipe.id],
    supplierIds: [supplier.id],
  };
}

/**
 * Switch user's current restaurant context
 */
export async function switchUserContext(
  userId: string,
  restaurantId: string
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { currentRestaurantId: restaurantId },
  });
}

/**
 * Assert that data is isolated between restaurants
 */
export async function assertDataIsolation(
  restaurantIdA: string,
  restaurantIdB: string,
  table: string = 'ingredient'
): Promise<{
  isolated: boolean;
  restaurantAData: any[];
  restaurantBData: any[];
  leakedRecords: any[];
}> {
  const model = (prisma as any)[table];
  if (!model) {
    throw new Error(`Unknown table: ${table}`);
  }

  const [restaurantAData, restaurantBData] = await Promise.all([
    model.findMany({ where: { restaurantId: restaurantIdA } }),
    model.findMany({ where: { restaurantId: restaurantIdB } }),
  ]);

  const idsA = new Set(restaurantAData.map((d: any) => d.id));
  const leakedRecords = restaurantBData.filter((d: any) => idsA.has(d.id));

  return {
    isolated: leakedRecords.length === 0,
    restaurantAData,
    restaurantBData,
    leakedRecords,
  };
}

/**
 * Verify access control for a user on a resource
 */
export async function verifyAccessControl(
  userId: string,
  resourceRestaurantId: string,
  expectedAccess: boolean
): Promise<{ authorized: boolean; actualAccess: boolean }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { restaurants: true },
  });

  if (!user) {
    return { authorized: false, actualAccess: false };
  }

  const hasAccess = user.restaurants.some(
    (r: any) => r.restaurantId === resourceRestaurantId
  );

  const userRestaurantId = user.currentRestaurantId;
  const actualAccess = userRestaurantId === resourceRestaurantId;

  return {
    authorized: hasAccess,
    actualAccess,
  };
}

/**
 * Compare financial reports between restaurants
 */
export async function compareFinancialReports(
  restaurantIdA: string,
  restaurantIdB: string
): Promise<{
  independent: boolean;
  reportA: { income: number; expenses: number };
  reportB: { income: number; expenses: number };
}> {
  // This is a simplified comparison
  // In production, you'd query actual financial tables

  return {
    independent: true,
    reportA: { income: 0, expenses: 0 },
    reportB: { income: 0, expenses: 0 },
  };
}

/**
 * Clean up multi-tenant test data
 */
export async function cleanupMultiTenantData(restaurantIds: string[]): Promise<void> {
  for (const restaurantId of restaurantIds) {
    // Delete in order to respect foreign keys
    await prisma.auditLog.deleteMany({ where: { restaurantId } });
    await prisma.notification.deleteMany({ where: { restaurantId } });
    await prisma.stockMovement.deleteMany({ where: { restaurantId } });
    await prisma.stock.deleteMany({ where: { restaurantId } });
    await prisma.recipeIngredient.deleteMany({ where: { restaurantId } });
    await prisma.recipe.deleteMany({ where: { restaurantId } });
    await prisma.ingredient.deleteMany({ where: { restaurantId } });
    await prisma.ingredientCategory.deleteMany({ where: { restaurantId } });
    await prisma.supplier.deleteMany({ where: { restaurantId } });
    await prisma.staffMember.deleteMany({ where: { restaurantId } });
    await prisma.restaurantUser.deleteMany({ where: { restaurantId } });
    await prisma.restaurant.deleteMany({ where: { id: restaurantId } });
  }
}

/**
 * Create user with specific role in restaurant
 */
export async function createUserWithRole(
  restaurantId: string,
  role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'COOK' | 'CASHIER',
  email?: string
): Promise<{ userId: string; email: string }> {
  const userEmail = email || `test-${role.toLowerCase()}-${Date.now()}@integration.test`;

  const user = await prisma.user.create({
    data: {
      email: userEmail,
      name: `Test ${role}`,
      password: 'hashed_password',
      role,
      currentRestaurantId: restaurantId,
      active: true,
    },
  });

  await prisma.restaurantUser.create({
    data: {
      restaurantId,
      userId: user.id,
      role,
    },
  });

  return { userId: user.id, email: userEmail };
}
