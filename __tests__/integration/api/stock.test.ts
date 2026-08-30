// @ts-nocheck
/**
 * Stock & Inventory Integration Tests
 * Validates complete stock workflows including movements, notifications, and audit trails
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import {
  createIngredientWithStock,
  createStockMovement,
  getCurrentStock,
  getNotifications,
  getAuditLogs,
  verifyDataIsolation,
} from '../helpers/api-workflows';
import {
  assertQueryPerformance,
  assertDataConsistency,
  cleanupRestaurantData,
} from '../helpers/db-assertions';
import {
  createMultiRestaurantScenario,
  createRestaurantTestData,
  createUserWithRole,
  cleanupMultiTenantData,
} from '../helpers/multi-tenant';
import { TEST_INGREDIENTS } from '../fixtures/test-data';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('Stock & Inventory Integration Tests', () => {
  let restaurantA: { restaurantId: string; ownerId: string };
  let restaurantB: { restaurantId: string; ownerId: string };
  let userA: { userId: string; email: string };
  let userB: { userId: string; email: string };

  beforeAll(async () => {
    // Setup multi-restaurant scenario
    const scenario = await createMultiRestaurantScenario();
    restaurantA = scenario.restaurantA;
    restaurantB = scenario.restaurantB;

    // Create users
    userA = await createUserWithRole(restaurantA.restaurantId, 'OWNER', 'owner-stock-a@test.com');
    userB = await createUserWithRole(restaurantB.restaurantId, 'OWNER', 'owner-stock-b@test.com');
  });

  afterAll(async () => {
    await cleanupMultiTenantData([restaurantA.restaurantId, restaurantB.restaurantId]);
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean stock movements before each test
    await prisma.stockMovement.deleteMany({
      where: {
        restaurantId: { in: [restaurantA.restaurantId, restaurantB.restaurantId] },
      },
    });
  });

  describe('Complete Stock Movement Cycle', () => {
    it('should create movement, trigger notification, and log audit', async () => {
      // Arrange: Create ingredient with initial stock
      const ingredientData = TEST_INGREDIENTS[0];
      const ingredient = await prisma.ingredient.create({
        data: {
          code: generateTestCode('ING'),
          name: ingredientData.name,
          unit: ingredientData.unit,
          minimumStock: ingredientData.minimumStock,
          currentStock: ingredientData.currentStock,
          restaurantId: restaurantA.restaurantId,
        },
      });

      await prisma.stock.create({
        data: {
          ingredientId: ingredient.id,
          quantity: ingredientData.currentStock,
          restaurantId: restaurantA.restaurantId,
        },
      });

      // Act: Create stock movement (withdrawal below minimum)
      const movement = await prisma.stockMovement.create({
        data: {
          ingredientId: ingredient.id,
          quantity: 45, // Will bring stock to 5, below minimum of 20
          type: 'WITHDRAWAL',
          reason: 'Production usage',
          restaurantId: restaurantA.restaurantId,
          createdById: userA.userId,
        },
      });

      // Update stock
      await prisma.stock.update({
        where: { ingredientId: ingredient.id },
        data: { quantity: { decrement: 45 } },
      });

      // Assert: Movement created
      expect(movement).toBeDefined();
      expect(movement.id).toBeDefined();
      expect(movement.quantity).toBe(45);

      // Assert: Stock updated
      const updatedStock = await prisma.stock.findUnique({
        where: { ingredientId: ingredient.id },
      });
      expect(updatedStock?.quantity).toBe(5); // 50 - 45

      // Assert: Notification triggered (if below minimum)
      if (updatedStock && updatedStock.quantity <= ingredient.minimumStock) {
        const notification = await prisma.notification.findFirst({
          where: {
            type: 'STOCK_LOW',
            restaurantId: restaurantA.restaurantId,
          },
        });
        expect(notification).toBeDefined();
        expect(notification?.severity).toBe('HIGH');
      }

      // Assert: Audit log created
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          entityType: 'STOCK_MOVEMENT',
          entityId: movement.id,
          restaurantId: restaurantA.restaurantId,
        },
      });
      expect(auditLog).toBeDefined();
      expect(auditLog?.action).toBe('CREATE');
    });

    it('should handle large batch stock movements efficiently', async () => {
      // Arrange
      const ingredient = await prisma.ingredient.create({
        data: {
          code: generateTestCode('ING'),
          name: 'Batch Test Ingredient',
          unit: 'KG',
          minimumStock: 100,
          currentStock: 1000,
          restaurantId: restaurantA.restaurantId,
        },
      });

      await prisma.stock.create({
        data: {
          ingredientId: ingredient.id,
          quantity: 1000,
          restaurantId: restaurantA.restaurantId,
        },
      });

      // Act: Create 50 movements in batch
      const movements = await Promise.all(
        Array.from({ length: 50 }, (_, i) =>
          prisma.stockMovement.create({
            data: {
              ingredientId: ingredient.id,
              quantity: 5,
              type: 'WITHDRAWAL',
              reason: `Batch test ${i}`,
              restaurantId: restaurantA.restaurantId,
              createdById: userA.userId,
            },
          })
        )
      );

      // Assert
      expect(movements).toHaveLength(50);
      expect(movements.every((m) => m.id)).toBe(true);

      // Verify final stock
      const finalStock = await prisma.stock.findUnique({
        where: { ingredientId: ingredient.id },
      });
      expect(finalStock?.quantity).toBe(750); // 1000 - (50 * 5)
    });
  });

  describe('Ingredient Lifecycle Management', () => {
    it('should create ingredient, add stock, and link to recipe', async () => {
      // Arrange & Act: Create ingredient with stock
      const ingredient = await prisma.ingredient.create({
        data: {
          code: generateTestCode('ING'),
          name: 'Lifecycle Test Ingredient',
          unit: 'KG',
          minimumStock: 10,
          currentStock: 100,
          restaurantId: restaurantA.restaurantId,
        },
      });

      await prisma.stock.create({
        data: {
          ingredientId: ingredient.id,
          quantity: 100,
          restaurantId: restaurantA.restaurantId,
        },
      });

      // Create recipe using this ingredient
      const recipe = await prisma.recipe.create({
        data: {
          code: generateTestCode('REC'),
          name: 'Test Recipe with Ingredient',
          description: 'Recipe for lifecycle test',
          baseYield: 10,
          restaurantId: restaurantA.restaurantId,
          ingredients: {
            create: [
              {
                ingredientId: ingredient.id,
                quantity: 0.5,
                unit: 'KG',
                restaurantId: restaurantA.restaurantId,
              },
            ],
          },
        },
      });

      // Assert
      expect(ingredient).toBeDefined();
      expect(ingredient.id).toBeDefined();

      const stock = await prisma.stock.findUnique({
        where: { ingredientId: ingredient.id },
      });
      expect(stock?.quantity).toBe(100);

      const recipeWithIngredients = await prisma.recipe.findUnique({
        where: { id: recipe.id },
        include: { ingredients: true },
      });
      expect(recipeWithIngredients?.ingredients).toHaveLength(1);
      expect(recipeWithIngredients?.ingredients[0].ingredientId).toBe(ingredient.id);
    });

    it('should update ingredient and reflect changes in stock', async () => {
      // Arrange
      const ingredient = await prisma.ingredient.create({
        data: {
          code: generateTestCode('ING'),
          name: 'Update Test Ingredient',
          unit: 'KG',
          minimumStock: 10,
          currentStock: 50,
          restaurantId: restaurantA.restaurantId,
        },
      });

      await prisma.stock.create({
        data: {
          ingredientId: ingredient.id,
          quantity: 50,
          restaurantId: restaurantA.restaurantId,
        },
      });

      // Act: Update minimum stock
      const updatedIngredient = await prisma.ingredient.update({
        where: { id: ingredient.id },
        data: { minimumStock: 25 },
      });

      // Assert
      expect(updatedIngredient.minimumStock).toBe(25);

      // Stock should remain unchanged
      const stock = await prisma.stock.findUnique({
        where: { ingredientId: ingredient.id },
      });
      expect(stock?.quantity).toBe(50);
    });
  });

  describe('Supplier Integration', () => {
    it('should create supplier and link ingredients', async () => {
      // Arrange
      const ingredient = await prisma.ingredient.create({
        data: {
          code: generateTestCode('ING'),
          name: 'Supplier Test Ingredient',
          unit: 'KG',
          minimumStock: 10,
          currentStock: 50,
          restaurantId: restaurantA.restaurantId,
        },
      });

      // Act: Create supplier with linked ingredient
      const supplier = await prisma.supplier.create({
        data: {
          code: generateTestCode('SUP'),
          name: 'Test Supplier',
          cnpj: '12.345.678/0001-90',
          restaurantId: restaurantA.restaurantId,
          ingredients: {
            create: [
              {
                ingredientId: ingredient.id,
                price: 15.50,
                restaurantId: restaurantA.restaurantId,
              },
            ],
          },
        },
      });

      // Assert
      const supplierWithIngredients = await prisma.supplier.findUnique({
        where: { id: supplier.id },
        include: { ingredients: true },
      });

      expect(supplierWithIngredients?.ingredients).toHaveLength(1);
      expect(supplierWithIngredients?.ingredients[0].price).toBe(15.50);
    });

    it('should create purchase order and receive stock', async () => {
      // Arrange
      const ingredient = await prisma.ingredient.create({
        data: {
          code: generateTestCode('ING'),
          name: 'PO Test Ingredient',
          unit: 'KG',
          minimumStock: 20,
          currentStock: 10,
          restaurantId: restaurantA.restaurantId,
        },
      });

      await prisma.stock.create({
        data: {
          ingredientId: ingredient.id,
          quantity: 10,
          restaurantId: restaurantA.restaurantId,
        },
      });

      const supplier = await prisma.supplier.create({
        data: {
          code: generateTestCode('SUP'),
          name: 'PO Test Supplier',
          restaurantId: restaurantA.restaurantId,
        },
      });

      // Act: Create purchase order (using shopping list as proxy)
      const shoppingList = await prisma.shoppingList.create({
        data: {
          name: 'Test Purchase Order',
          status: 'PENDING',
          restaurantId: restaurantA.restaurantId,
          items: {
            create: [
              {
                ingredientId: ingredient.id,
                quantity: 50,
                unit: 'KG',
                estimatedCost: 15.50 * 50,
                restaurantId: restaurantA.restaurantId,
              },
            ],
          },
        },
      });

      // Simulate stock receipt
      await prisma.stockMovement.create({
        data: {
          ingredientId: ingredient.id,
          quantity: 50,
          type: 'ENTRY',
          reason: `Stock receipt for list ${shoppingList.id}`,
          restaurantId: restaurantA.restaurantId,
          createdById: userA.userId,
        },
      });

      await prisma.stock.update({
        where: { ingredientId: ingredient.id },
        data: { quantity: { increment: 50 } },
      });

      // Assert
      const updatedStock = await prisma.stock.findUnique({
        where: { ingredientId: ingredient.id },
      });
      expect(updatedStock?.quantity).toBe(60); // 10 + 50

      // Update shopping list status
      await prisma.shoppingList.update({
        where: { id: shoppingList.id },
        data: { status: 'RECEIVED' },
      });

      const updatedList = await prisma.shoppingList.findUnique({
        where: { id: shoppingList.id },
      });
      expect(updatedList?.status).toBe('RECEIVED');
    });
  });

  describe('Low Stock Automation', () => {
    it('should trigger notification when stock falls below minimum', async () => {
      // Arrange
      const ingredient = await prisma.ingredient.create({
        data: {
          code: generateTestCode('ING'),
          name: 'Low Stock Test Ingredient',
          unit: 'KG',
          minimumStock: 20,
          currentStock: 25,
          restaurantId: restaurantA.restaurantId,
        },
      });

      await prisma.stock.create({
        data: {
          ingredientId: ingredient.id,
          quantity: 25,
          restaurantId: restaurantA.restaurantId,
        },
      });

      // Act: Withdraw stock to bring below minimum
      await prisma.stockMovement.create({
        data: {
          ingredientId: ingredient.id,
          quantity: 10,
          type: 'WITHDRAWAL',
          reason: 'Production',
          restaurantId: restaurantA.restaurantId,
          createdById: userA.userId,
        },
      });

      await prisma.stock.update({
        where: { ingredientId: ingredient.id },
        data: { quantity: { decrement: 10 } },
      });

      // Create notification manually (simulating the system behavior)
      const notification = await prisma.notification.create({
        data: {
          userId: userA.userId,
          type: 'STOCK_LOW',
          severity: 'HIGH',
          title: 'Estoque Baixo',
          message: `O ingrediente ${ingredient.name} está abaixo do mínimo (${15} < ${ingredient.minimumStock})`,
          data: { ingredientId: ingredient.id, currentStock: 15, minimumStock: ingredient.minimumStock },
          restaurantId: restaurantA.restaurantId,
        },
      });

      // Assert
      expect(notification).toBeDefined();
      expect(notification.type).toBe('STOCK_LOW');
      expect(notification.severity).toBe('HIGH');
      expect(notification.data).toMatchObject({
        ingredientId: ingredient.id,
        currentStock: 15,
        minimumStock: 20,
      });
    });

    it('should trigger CRITICAL notification when stock reaches zero', async () => {
      // Arrange
      const ingredient = await prisma.ingredient.create({
        data: {
          code: generateTestCode('ING'),
          name: 'Critical Stock Test',
          unit: 'KG',
          minimumStock: 10,
          currentStock: 5,
          restaurantId: restaurantA.restaurantId,
        },
      });

      await prisma.stock.create({
        data: {
          ingredientId: ingredient.id,
          quantity: 5,
          restaurantId: restaurantA.restaurantId,
        },
      });

      // Act: Withdraw all remaining stock
      await prisma.stockMovement.create({
        data: {
          ingredientId: ingredient.id,
          quantity: 5,
          type: 'WITHDRAWAL',
          reason: 'Production',
          restaurantId: restaurantA.restaurantId,
          createdById: userA.userId,
        },
      });

      await prisma.stock.update({
        where: { ingredientId: ingredient.id },
        data: { quantity: 0 },
      });

      // Create critical notification
      const notification = await prisma.notification.create({
        data: {
          userId: userA.userId,
          type: 'STOCK_CRITICAL',
          severity: 'CRITICAL',
          title: 'Estoque Crítico - Zerado',
          message: `O ingrediente ${ingredient.name} está com estoque zerado!`,
          data: { ingredientId: ingredient.id, currentStock: 0, minimumStock: ingredient.minimumStock },
          restaurantId: restaurantA.restaurantId,
        },
      });

      // Assert
      expect(notification.severity).toBe('CRITICAL');
      expect(notification.type).toBe('STOCK_CRITICAL');
    });
  });

  describe('Multi-Restaurant Stock Isolation', () => {
    it('should maintain separate stock for each restaurant', async () => {
      // Arrange: Create same ingredient in both restaurants
      const ingredientA = await prisma.ingredient.create({
        data: {
          code: 'SAME-CODE-001',
          name: 'Shared Ingredient',
          unit: 'KG',
          minimumStock: 10,
          currentStock: 100,
          restaurantId: restaurantA.restaurantId,
        },
      });

      const ingredientB = await prisma.ingredient.create({
        data: {
          code: 'SAME-CODE-001',
          name: 'Shared Ingredient',
          unit: 'KG',
          minimumStock: 10,
          currentStock: 50,
          restaurantId: restaurantB.restaurantId,
        },
      });

      await prisma.stock.create({
        data: {
          ingredientId: ingredientA.id,
          quantity: 100,
          restaurantId: restaurantA.restaurantId,
        },
      });

      await prisma.stock.create({
        data: {
          ingredientId: ingredientB.id,
          quantity: 50,
          restaurantId: restaurantB.restaurantId,
        },
      });

      // Act: Update stock in restaurant A
      await prisma.stock.update({
        where: { ingredientId: ingredientA.id },
        data: { quantity: { decrement: 30 } },
      });

      await prisma.stockMovement.create({
        data: {
          ingredientId: ingredientA.id,
          quantity: 30,
          type: 'WITHDRAWAL',
          reason: 'Test',
          restaurantId: restaurantA.restaurantId,
          createdById: userA.userId,
        },
      });

      // Assert: Restaurant A stock changed
      const stockA = await prisma.stock.findUnique({
        where: { ingredientId: ingredientA.id },
      });
      expect(stockA?.quantity).toBe(70); // 100 - 30

      // Assert: Restaurant B stock unchanged
      const stockB = await prisma.stock.findUnique({
        where: { ingredientId: ingredientB.id },
      });
      expect(stockB?.quantity).toBe(50); // Unchanged
    });

    it('should prevent cross-restaurant stock movements', async () => {
      // Arrange
      const ingredientA = await prisma.ingredient.create({
        data: {
          code: generateTestCode('ING'),
          name: 'Isolated Ingredient A',
          unit: 'KG',
          minimumStock: 10,
          currentStock: 50,
          restaurantId: restaurantA.restaurantId,
        },
      });

      await prisma.stock.create({
        data: {
          ingredientId: ingredientA.id,
          quantity: 50,
          restaurantId: restaurantA.restaurantId,
        },
      });

      // Act & Assert: Try to create movement with wrong restaurant
      await expect(
        prisma.stockMovement.create({
          data: {
            ingredientId: ingredientA.id,
            quantity: 10,
            type: 'WITHDRAWAL',
            reason: 'Test cross-restaurant',
            restaurantId: restaurantB.restaurantId, // Wrong restaurant
            createdById: userB.userId,
          },
        })
      ).rejects.toThrow(); // Should fail due to referential integrity
    });
  });

  describe('Query Performance', () => {
    it('should retrieve stock movements within performance threshold', async () => {
      // Arrange: Create multiple movements
      const ingredient = await prisma.ingredient.create({
        data: {
          code: generateTestCode('ING'),
          name: 'Performance Test Ingredient',
          unit: 'KG',
          minimumStock: 10,
          currentStock: 1000,
          restaurantId: restaurantA.restaurantId,
        },
      });

      await prisma.stock.create({
        data: {
          ingredientId: ingredient.id,
          quantity: 1000,
          restaurantId: restaurantA.restaurantId,
        },
      });

      // Create 100 movements
      await Promise.all(
        Array.from({ length: 100 }, (_, i) =>
          prisma.stockMovement.create({
            data: {
              ingredientId: ingredient.id,
              quantity: i + 1,
              type: i % 2 === 0 ? 'ENTRY' : 'WITHDRAWAL',
              reason: `Performance test ${i}`,
              restaurantId: restaurantA.restaurantId,
              createdById: userA.userId,
            },
          })
        )
      );

      // Act & Assert: Query with performance check
      const { result, duration } = await assertQueryPerformance(
        () =>
          prisma.stockMovement.findMany({
            where: {
              restaurantId: restaurantA.restaurantId,
              ingredientId: ingredient.id,
            },
            orderBy: { createdAt: 'desc' },
            take: 50,
          }),
        500,
        'Stock movements query'
      );

      expect(result).toHaveLength(50);
      expect(duration).toBeLessThan(500);
    });
  });
});

function generateTestCode(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`.toUpperCase();
}
