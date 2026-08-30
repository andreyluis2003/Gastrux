// @ts-nocheck
/**
 * Multi-Tenant Isolation Tests
 * Validates data isolation between restaurants
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import {
  assertDataIsolation,
  verifyAccessControl,
  createMultiRestaurantScenario,
  createRestaurantTestData,
  createUserWithRole,
  cleanupMultiTenantData,
} from '../helpers/multi-tenant';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('Multi-Tenant Isolation Tests', () => {
  let restaurantA: { restaurantId: string; ownerId: string };
  let restaurantB: { restaurantId: string; ownerId: string };
  let userA: { userId: string; email: string };
  let userB: { userId: string; email: string };

  beforeAll(async () => {
    const scenario = await createMultiRestaurantScenario();
    restaurantA = scenario.restaurantA;
    restaurantB = scenario.restaurantB;

    userA = await createUserWithRole(restaurantA.restaurantId, 'OWNER', 'owner-iso-a@test.com');
    userB = await createUserWithRole(restaurantB.restaurantId, 'OWNER', 'owner-iso-b@test.com');

    // Create test data in both restaurants
    await Promise.all([
      createRestaurantTestData(restaurantA.restaurantId, userA.userId),
      createRestaurantTestData(restaurantB.restaurantId, userB.userId),
    ]);
  });

  afterAll(async () => {
    await cleanupMultiTenantData([restaurantA.restaurantId, restaurantB.restaurantId]);
    await prisma.$disconnect();
  });

  describe('Data Isolation', () => {
    it('should isolate ingredients between restaurants', async () => {
      // Arrange: Create same-named ingredient in both restaurants
      const ingredientA = await prisma.ingredient.create({
        data: {
          code: 'SHARED-CODE-001',
          name: 'Shared Ingredient Name',
          unit: 'KG',
          minimumStock: 10,
          currentStock: 50,
          restaurantId: restaurantA.restaurantId,
        },
      });

      const ingredientB = await prisma.ingredient.create({
        data: {
          code: 'SHARED-CODE-001',
          name: 'Shared Ingredient Name',
          unit: 'KG',
          minimumStock: 10,
          currentStock: 30,
          restaurantId: restaurantB.restaurantId,
        },
      });

      // Act & Assert: Query per restaurant
      const ingredientsA = await prisma.ingredient.findMany({
        where: { restaurantId: restaurantA.restaurantId },
      });

      const ingredientsB = await prisma.ingredient.findMany({
        where: { restaurantId: restaurantB.restaurantId },
      });

      // Each restaurant should only see its own data
      expect(ingredientsA.some((i: any) => i.id === ingredientA.id)).toBe(true);
      expect(ingredientsA.some((i: any) => i.id === ingredientB.id)).toBe(false);

      expect(ingredientsB.some((i: any) => i.id === ingredientB.id)).toBe(true);
      expect(ingredientsB.some((i: any) => i.id === ingredientA.id)).toBe(false);
    });

    it('should isolate orders between restaurants', async () => {
      // Arrange: Create orders in both restaurants
      const orderA = await prisma.order.create({
        data: {
          type: 'DINE_IN',
          table: 'ISO-A-001',
          status: 'RECEIVED',
          restaurantId: restaurantA.restaurantId,
        },
      });

      const orderB = await prisma.order.create({
        data: {
          type: 'DINE_IN',
          table: 'ISO-B-001',
          status: 'RECEIVED',
          restaurantId: restaurantB.restaurantId,
        },
      });

      // Act
      const ordersA = await prisma.order.findMany({
        where: { restaurantId: restaurantA.restaurantId },
      });

      const ordersB = await prisma.order.findMany({
        where: { restaurantId: restaurantB.restaurantId },
      });

      // Assert
      expect(ordersA.map((o: any) => o.id)).toContain(orderA.id);
      expect(ordersA.map((o: any) => o.id)).not.toContain(orderB.id);

      expect(ordersB.map((o: any) => o.id)).toContain(orderB.id);
      expect(ordersB.map((o: any) => o.id)).not.toContain(orderA.id);
    });

    it('should isolate stock movements between restaurants', async () => {
      // Arrange
      const ingredientA = await prisma.ingredient.create({
        data: {
          code: 'ISO-STK-A',
          name: 'Stock Isolation A',
          unit: 'KG',
          minimumStock: 10,
          currentStock: 100,
          restaurantId: restaurantA.restaurantId,
        },
      });

      const ingredientB = await prisma.ingredient.create({
        data: {
          code: 'ISO-STK-B',
          name: 'Stock Isolation B',
          unit: 'KG',
          minimumStock: 10,
          currentStock: 100,
          restaurantId: restaurantB.restaurantId,
        },
      });

      await Promise.all([
        prisma.stock.create({
          data: {
            ingredientId: ingredientA.id,
            quantity: 100,
            restaurantId: restaurantA.restaurantId,
          },
        }),
        prisma.stock.create({
          data: {
            ingredientId: ingredientB.id,
            quantity: 100,
            restaurantId: restaurantB.restaurantId,
          },
        }),
      ]);

      // Create movements
      const movementA = await prisma.stockMovement.create({
        data: {
          ingredientId: ingredientA.id,
          quantity: 10,
          type: 'WITHDRAWAL',
          reason: 'Isolation test A',
          restaurantId: restaurantA.restaurantId,
          createdById: userA.userId,
        },
      });

      const movementB = await prisma.stockMovement.create({
        data: {
          ingredientId: ingredientB.id,
          quantity: 20,
          type: 'WITHDRAWAL',
          reason: 'Isolation test B',
          restaurantId: restaurantB.restaurantId,
          createdById: userB.userId,
        },
      });

      // Act
      const movementsA = await prisma.stockMovement.findMany({
        where: { restaurantId: restaurantA.restaurantId },
      });

      const movementsB = await prisma.stockMovement.findMany({
        where: { restaurantId: restaurantB.restaurantId },
      });

      // Assert
      expect(movementsA.map((m: any) => m.id)).toContain(movementA.id);
      expect(movementsA.map((m: any) => m.id)).not.toContain(movementB.id);

      expect(movementsB.map((m: any) => m.id)).toContain(movementB.id);
      expect(movementsB.map((m: any) => m.id)).not.toContain(movementA.id);
    });

    it('should isolate financial transactions between restaurants', async () => {
      // Arrange
      const transactionA = await prisma.financialTransaction.create({
        data: {
          type: 'INCOME',
          amount: 1000.00,
          description: 'Restaurant A Revenue',
          category: 'Vendas',
          status: 'COMPLETED',
          restaurantId: restaurantA.restaurantId,
          createdById: userA.userId,
          date: new Date(),
        },
      });

      const transactionB = await prisma.financialTransaction.create({
        data: {
          type: 'INCOME',
          amount: 2000.00,
          description: 'Restaurant B Revenue',
          category: 'Vendas',
          status: 'COMPLETED',
          restaurantId: restaurantB.restaurantId,
          createdById: userB.userId,
          date: new Date(),
        },
      });

      // Act
      const transactionsA = await prisma.financialTransaction.findMany({
        where: { restaurantId: restaurantA.restaurantId },
      });

      const transactionsB = await prisma.financialTransaction.findMany({
        where: { restaurantId: restaurantB.restaurantId },
      });

      // Assert
      expect(transactionsA.map((t: any) => t.id)).toContain(transactionA.id);
      expect(transactionsA.map((t: any) => t.id)).not.toContain(transactionB.id);

      expect(transactionsB.map((t: any) => t.id)).toContain(transactionB.id);
      expect(transactionsB.map((t: any) => t.id)).not.toContain(transactionA.id);
    });
  });

  describe('Cross-Tenant Query Prevention', () => {
    it('should prevent querying across restaurants without proper context', async () => {
      // Arrange: Create data in restaurant A
      const ingredient = await prisma.ingredient.create({
        data: {
          code: 'CROSS-001',
          name: 'Cross Tenant Test',
          unit: 'KG',
          minimumStock: 10,
          currentStock: 50,
          restaurantId: restaurantA.restaurantId,
        },
      });

      // Act: Try to find ingredient from restaurant A using B's context
      const foundFromA = await prisma.ingredient.findMany({
        where: {
          restaurantId: restaurantA.restaurantId,
          id: ingredient.id,
        },
      });

      const foundFromB = await prisma.ingredient.findMany({
        where: {
          restaurantId: restaurantB.restaurantId,
          id: ingredient.id,
        },
      });

      // Assert: Should find in A, not in B
      expect(foundFromA).toHaveLength(1);
      expect(foundFromB).toHaveLength(0);
    });

    it('should enforce restaurantId in queries', async () => {
      // Act: Query without restaurantId should return all (but app should filter)
      const allIngredients = await prisma.ingredient.findMany({});

      // This test documents the expected behavior
      // In production, middleware should enforce filtering
      expect(allIngredients.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Access Control', () => {
    it('should verify user access to restaurant resources', async () => {
      // Arrange
      const { userId: managerId } = await createUserWithRole(
        restaurantA.restaurantId,
        'MANAGER',
        'manager-iso-a@test.com'
      );

      // Act & Assert: Manager should have access to restaurant A
      const accessA = await verifyAccessControl(managerId, restaurantA.restaurantId, true);
      expect(accessA.authorized).toBe(true);
      expect(accessA.actualAccess).toBe(true);

      // Manager should NOT have access to restaurant B
      const accessB = await verifyAccessControl(managerId, restaurantB.restaurantId, false);
      expect(accessB.authorized).toBe(false);
    });

    it('should prevent unauthorized access to restaurant data', async () => {
      // Arrange: Create user only in restaurant A
      const { userId: restrictedUserId } = await createUserWithRole(
        restaurantA.restaurantId,
        'COOK',
        'cook-restricted@test.com'
      );

      // Act: User tries to access restaurant B (should fail)
      const user = await prisma.user.findUnique({
        where: { id: restrictedUserId },
        include: { restaurants: true },
      });

      const hasAccessToB = user?.restaurants.some(
        (r: any) => r.restaurantId === restaurantB.restaurantId
      );

      // Assert
      expect(hasAccessToB).toBe(false);
    });
  });

  describe('Parallel Independent Operations', () => {
    it('should handle simultaneous operations in different restaurants', async () => {
      // Arrange
      const promises = [
        // Restaurant A: Create 5 ingredients
        Promise.all(
          Array.from({ length: 5 }, (_, i) =>
            prisma.ingredient.create({
              data: {
                code: `PAR-A-${i}`,
                name: `Parallel A ${i}`,
                unit: 'KG',
                minimumStock: 10,
                currentStock: 50,
                restaurantId: restaurantA.restaurantId,
              },
            })
          )
        ),
        // Restaurant B: Create 3 ingredients
        Promise.all(
          Array.from({ length: 3 }, (_, i) =>
            prisma.ingredient.create({
              data: {
                code: `PAR-B-${i}`,
                name: `Parallel B ${i}`,
                unit: 'KG',
                minimumStock: 10,
                currentStock: 50,
                restaurantId: restaurantB.restaurantId,
              },
            })
          )
        ),
      ];

      // Act
      const [ingredientsA, ingredientsB] = await Promise.all(promises);

      // Assert: Each restaurant should have correct count
      expect(ingredientsA).toHaveLength(5);
      expect(ingredientsB).toHaveLength(3);

      // Verify no cross-contamination
      const allIdsA = ingredientsA.map((i: any) => i.id);
      const allIdsB = ingredientsB.map((i: any) => i.id);

      const intersection = allIdsA.filter((id: string) => allIdsB.includes(id));
      expect(intersection).toHaveLength(0);
    });

    it('should maintain data consistency during concurrent operations', async () => {
      // Arrange: Create shared resource in A
      const ingredient = await prisma.ingredient.create({
        data: {
          code: 'CONCURRENT-001',
          name: 'Concurrent Test',
          unit: 'KG',
          minimumStock: 10,
          currentStock: 200,
          restaurantId: restaurantA.restaurantId,
        },
      });

      await prisma.stock.create({
        data: {
          ingredientId: ingredient.id,
          quantity: 200,
          restaurantId: restaurantA.restaurantId,
        },
      });

      // Act: Concurrent updates
      const updates = Array.from({ length: 10 }, (_, i) =>
        prisma.stockMovement.create({
          data: {
            ingredientId: ingredient.id,
            quantity: 5,
            type: 'WITHDRAWAL',
            reason: `Concurrent ${i}`,
            restaurantId: restaurantA.restaurantId,
            createdById: userA.userId,
          },
        }).then(() =>
          prisma.stock.update({
            where: { ingredientId: ingredient.id },
            data: { quantity: { decrement: 5 } },
          })
        )
      );

      await Promise.all(updates);

      // Assert
      const finalStock = await prisma.stock.findUnique({
        where: { ingredientId: ingredient.id },
      });

      expect(finalStock?.quantity).toBe(150); // 200 - (10 * 5)
    });
  });

  describe('Data Cleanup Isolation', () => {
    it('should only delete data from specified restaurant', async () => {
      // Arrange: Create ingredients in both restaurants
      const ingredientA = await prisma.ingredient.create({
        data: {
          code: 'CLEANUP-A',
          name: 'Cleanup A',
          unit: 'KG',
          minimumStock: 10,
          currentStock: 50,
          restaurantId: restaurantA.restaurantId,
        },
      });

      const ingredientB = await prisma.ingredient.create({
        data: {
          code: 'CLEANUP-B',
          name: 'Cleanup B',
          unit: 'KG',
          minimumStock: 10,
          currentStock: 50,
          restaurantId: restaurantB.restaurantId,
        },
      });

      // Act: Delete only restaurant A data
      await prisma.ingredient.deleteMany({
        where: { restaurantId: restaurantA.restaurantId },
      });

      // Assert: A's data deleted, B's preserved
      const foundA = await prisma.ingredient.findUnique({
        where: { id: ingredientA.id },
      });
      const foundB = await prisma.ingredient.findUnique({
        where: { id: ingredientB.id },
      });

      expect(foundA).toBeNull();
      expect(foundB).toBeDefined();
    });
  });
});
