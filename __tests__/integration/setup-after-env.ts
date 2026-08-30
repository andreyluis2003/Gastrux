/**
 * Setup After Environment for Integration Tests
 * Runs after Jest environment is set up, before each test file
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Global test utilities
(global as any).__PRISMA__ = prisma;

beforeAll(async () => {
  console.log('\n📦 Test suite starting...');
  await prisma.$connect();
  
  // Clean test data before suite runs
  await cleanupAllTestData();
});

afterAll(async () => {
  // Clean test data after suite completes
  await cleanupAllTestData();
  await prisma.$disconnect();
  console.log('📦 Test suite complete\n');
});

/**
 * Clean all test data from database
 */
async function cleanupAllTestData() {
  const testEmails = [
    'owner-a@integration.test',
    'owner-b@integration.test',
    'manager-a@integration.test',
    'cook-a@integration.test',
    'cashier-a@integration.test',
    'owner-int@test.com',
    'manager-int@test.com',
    'cook-int@test.com',
    'cashier-int@test.com',
    'owner-stock-a@test.com',
    'owner-stock-b@test.com',
    'owner-orders-a@test.com',
    'owner-orders-b@test.com',
    'owner-fin-a@test.com',
    'owner-fin-b@test.com',
    'owner-trx@test.com',
    'owner-perf@test.com',
    'owner-iso-a@test.com',
    'owner-iso-b@test.com',
    'owner-workflow-a@test.com',
    'owner-workflow-b@test.com',
    'owner-delivery@test.com',
    'multi-restaurant@test.com',
    'different-roles@test.com',
    'manager-iso-a@test.com',
    'cook-restricted@test.com',
  ];

  // Delete test users by email
  for (const email of testEmails) {
    try {
      const user = await prisma.user.findUnique({ where: { email } });
      if (user) {
        // Delete related data first
        await prisma.auditLog.deleteMany({ where: { userId: user.id } });
        await prisma.notification.deleteMany({ where: { userId: user.id } });
        await prisma.restaurantUser.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
      }
    } catch (error) {
      // Ignore errors during cleanup
    }
  }

  // Clean test restaurants
  const testRestaurantNames = [
    'Restaurant A - Integration Test',
    'Restaurant B - Integration Test',
    'Delivery Restaurant A',
    'Delivery Restaurant B',
    'Pizzaria Bella Integration',
    'Burger House Integration',
  ];

  for (const name of testRestaurantNames) {
    try {
      const restaurant = await prisma.restaurant.findFirst({ where: { name } });
      if (restaurant) {
        // Clean related data in correct order
        await prisma.auditLog.deleteMany({ where: { restaurantId: restaurant.id } });
        await prisma.notification.deleteMany({ where: { restaurantId: restaurant.id } });
        await prisma.stockMovement.deleteMany({ where: { restaurantId: restaurant.id } });
        await prisma.adjustmentItem.deleteMany({ where: { restaurantId: restaurant.id } });
        await prisma.inventoryAdjustment.deleteMany({ where: { restaurantId: restaurant.id } });
        await prisma.shoppingListItem.deleteMany({ where: { restaurantId: restaurant.id } });
        await prisma.shoppingList.deleteMany({ where: { restaurantId: restaurant.id } });
        await prisma.consolidatedNeed.deleteMany({ where: { restaurantId: restaurant.id } });
        await prisma.productionPlanItem.deleteMany({ where: { restaurantId: restaurant.id } });
        await prisma.productionPlan.deleteMany({ where: { restaurantId: restaurant.id } });
        await prisma.wasteLog.deleteMany({ where: { restaurantId: restaurant.id } });
        await prisma.stock.deleteMany({ where: { restaurantId: restaurant.id } });
        await prisma.recipeIngredient.deleteMany({ where: { recipe: { restaurantId: restaurant.id } } });
        await prisma.recipe.deleteMany({ where: { restaurantId: restaurant.id } });
        await prisma.ingredient.deleteMany({ where: { restaurantId: restaurant.id } });
        await prisma.ingredientCategory.deleteMany({ where: { restaurantId: restaurant.id } });
        await prisma.supplier.deleteMany({ where: { restaurantId: restaurant.id } });
        await prisma.staffMember.deleteMany({ where: { restaurantId: restaurant.id } });
        await prisma.restaurantUser.deleteMany({ where: { restaurantId: restaurant.id } });
        await prisma.chartOfAccount.deleteMany({ where: { restaurantId: restaurant.id } });
        await prisma.incomeCategory.deleteMany({ where: { restaurantId: restaurant.id } });
        await prisma.expenseCategory.deleteMany({ where: { restaurantId: restaurant.id } });
        await prisma.restaurant.delete({ where: { id: restaurant.id } });
      }
    } catch (error) {
      // Ignore errors during cleanup
    }
  }
}
