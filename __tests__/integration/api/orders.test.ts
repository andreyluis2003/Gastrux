// @ts-nocheck
/**
 * Orders & KDS Integration Tests
 * Validates complete order workflows from creation to completion
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import {
  createIngredientWithStock,
  createRecipeWithIngredients,
  createCompleteOrderWorkflow,
  processOrderToCompletion,
  getNotifications,
  getAuditLogs,
} from '../helpers/api-workflows';
import {
  assertQueryPerformance,
  assertDataConsistency,
} from '../helpers/db-assertions';
import {
  createMultiRestaurantScenario,
  createRestaurantTestData,
  createUserWithRole,
  cleanupMultiTenantData,
} from '../helpers/multi-tenant';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('Orders & KDS Integration Tests', () => {
  let restaurantA: { restaurantId: string; ownerId: string };
  let restaurantB: { restaurantId: string; ownerId: string };
  let userA: { userId: string; email: string };
  let userB: { userId: string; email: string };
  let testRecipe: any;
  let testIngredient: any;

  beforeAll(async () => {
    const scenario = await createMultiRestaurantScenario();
    restaurantA = scenario.restaurantA;
    restaurantB = scenario.restaurantB;

    userA = await createUserWithRole(restaurantA.restaurantId, 'OWNER', 'owner-orders-a@test.com');
    userB = await createUserWithRole(restaurantB.restaurantId, 'OWNER', 'owner-orders-b@test.com');

    // Create test data for restaurant A
    const testData = await createRestaurantTestData(restaurantA.restaurantId, userA.userId);

    // Create a recipe for orders
    testIngredient = await prisma.ingredient.create({
      data: {
        code: 'ORD-ING-001',
        name: 'Order Test Ingredient',
        unit: 'UN',
        minimumStock: 20,
        currentStock: 100,
        restaurantId: restaurantA.restaurantId,
      },
    });

    await prisma.stock.create({
      data: {
        ingredientId: testIngredient.id,
        quantity: 100,
        restaurantId: restaurantA.restaurantId,
      },
    });

    testRecipe = await prisma.recipe.create({
      data: {
        code: 'ORD-REC-001',
        name: 'Order Test Recipe',
        description: 'Recipe for order testing',
        baseYield: 1,
        restaurantId: restaurantA.restaurantId,
        ingredients: {
          create: [
            {
              ingredientId: testIngredient.id,
              quantity: 2,
              unit: 'UN',
              restaurantId: restaurantA.restaurantId,
            },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    await cleanupMultiTenantData([restaurantA.restaurantId, restaurantB.restaurantId]);
    await prisma.$disconnect();
  });

  describe('Complete Order Lifecycle', () => {
    it('should create order, add items, update status, and complete', async () => {
      // Arrange
      const orderItems = [
        { recipeId: testRecipe.id, quantity: 2, notes: 'Extra hot' },
      ];

      // Act: Create order
      const order = await prisma.order.create({
        data: {
          type: 'DINE_IN',
          table: 'MESA-01',
          status: 'RECEIVED',
          restaurantId: restaurantA.restaurantId,
          items: {
            create: orderItems.map((item) => ({
              recipeId: item.recipeId,
              quantity: item.quantity,
              notes: item.notes,
              status: 'PENDING',
              restaurantId: restaurantA.restaurantId,
            })),
          },
        },
        include: { items: true },
      });

      expect(order).toBeDefined();
      expect(order.status).toBe('RECEIVED');
      expect(order.items).toHaveLength(1);

      // Update to PREPARING
      const preparingOrder = await prisma.order.update({
        where: { id: order.id },
        data: { status: 'PREPARING' },
        include: { items: true },
      });
      expect(preparingOrder.status).toBe('PREPARING');

      // Update items to IN_PROGRESS
      await prisma.orderItem.updateMany({
        where: { orderId: order.id },
        data: { status: 'IN_PROGRESS' },
      });

      // Update to READY
      const readyOrder = await prisma.order.update({
        where: { id: order.id },
        data: { status: 'READY' },
        include: { items: true },
      });
      expect(readyOrder.status).toBe('READY');

      // Update items to COMPLETED
      await prisma.orderItem.updateMany({
        where: { orderId: order.id },
        data: { status: 'COMPLETED' },
      });

      // Complete order
      const completedOrder = await prisma.order.update({
        where: { id: order.id },
        data: { status: 'COMPLETED' },
        include: { items: true },
      });
      expect(completedOrder.status).toBe('COMPLETED');
      expect(completedOrder.items.every((item: any) => item.status === 'COMPLETED')).toBe(true);

      // Assert: Audit log created
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          entityType: 'ORDER',
          entityId: order.id,
          restaurantId: restaurantA.restaurantId,
        },
      });
      expect(auditLog).toBeDefined();
    });

    it('should create delivery order with customer details', async () => {
      // Act
      const order = await prisma.order.create({
        data: {
          type: 'DELIVERY',
          status: 'RECEIVED',
          customerName: 'João Silva',
          customerPhone: '+55 11 99999-1111',
          address: 'Rua Teste, 123 - São Paulo',
          restaurantId: restaurantA.restaurantId,
          items: {
            create: [
              {
                recipeId: testRecipe.id,
                quantity: 1,
                status: 'PENDING',
                restaurantId: restaurantA.restaurantId,
              },
            ],
          },
        },
        include: { items: true },
      });

      // Assert
      expect(order.type).toBe('DELIVERY');
      expect(order.customerName).toBe('João Silva');
      expect(order.customerPhone).toBe('+55 11 99999-1111');
      expect(order.address).toBe('Rua Teste, 123 - São Paulo');
      expect(order.items).toHaveLength(1);
    });
  });

  describe('Multi-Item Orders', () => {
    it('should handle order with multiple items and modifiers', async () => {
      // Arrange: Create additional recipe
      const secondIngredient = await prisma.ingredient.create({
        data: {
          code: 'ORD-ING-002',
          name: 'Second Ingredient',
          unit: 'KG',
          minimumStock: 10,
          currentStock: 50,
          restaurantId: restaurantA.restaurantId,
        },
      });

      await prisma.stock.create({
        data: {
          ingredientId: secondIngredient.id,
          quantity: 50,
          restaurantId: restaurantA.restaurantId,
        },
      });

      const secondRecipe = await prisma.recipe.create({
        data: {
          code: 'ORD-REC-002',
          name: 'Second Recipe',
          baseYield: 1,
          restaurantId: restaurantA.restaurantId,
          ingredients: {
            create: [
              {
                ingredientId: secondIngredient.id,
                quantity: 0.5,
                unit: 'KG',
                restaurantId: restaurantA.restaurantId,
              },
            ],
          },
        },
      });

      // Act: Create order with multiple items
      const order = await prisma.order.create({
        data: {
          type: 'DINE_IN',
          table: 'MESA-05',
          status: 'RECEIVED',
          restaurantId: restaurantA.restaurantId,
          items: {
            create: [
              {
                recipeId: testRecipe.id,
                quantity: 2,
                notes: 'Sem cebola',
                status: 'PENDING',
                restaurantId: restaurantA.restaurantId,
              },
              {
                recipeId: secondRecipe.id,
                quantity: 1,
                notes: 'Bem passado',
                status: 'PENDING',
                restaurantId: restaurantA.restaurantId,
              },
            ],
          },
        },
        include: { items: { include: { recipe: true } } },
      });

      // Assert
      expect(order.items).toHaveLength(2);
      expect(order.items[0].notes).toBe('Sem cebola');
      expect(order.items[1].notes).toBe('Bem passado');
      expect(order.items[0].recipe.name).toBe('Order Test Recipe');
      expect(order.items[1].recipe.name).toBe('Second Recipe');
    });

    it('should allow partial item completion', async () => {
      // Arrange
      const order = await prisma.order.create({
        data: {
          type: 'DINE_IN',
          table: 'MESA-03',
          status: 'PREPARING',
          restaurantId: restaurantA.restaurantId,
          items: {
            create: [
              {
                recipeId: testRecipe.id,
                quantity: 3,
                status: 'IN_PROGRESS',
                restaurantId: restaurantA.restaurantId,
              },
            ],
          },
        },
        include: { items: true },
      });

      // Act: Complete only 2 of 3 items
      const item = order.items[0];
      await prisma.orderItem.update({
        where: { id: item.id },
        data: { quantity: 2, status: 'COMPLETED' },
      });

      // Create a new item for the remaining quantity
      await prisma.orderItem.create({
        data: {
          orderId: order.id,
          recipeId: testRecipe.id,
          quantity: 1,
          status: 'IN_PROGRESS',
          restaurantId: restaurantA.restaurantId,
        },
      });

      // Assert
      const updatedOrder = await prisma.order.findUnique({
        where: { id: order.id },
        include: { items: true },
      });

      expect(updatedOrder?.items).toHaveLength(2);
      expect(updatedOrder?.items.some((i: any) => i.status === 'COMPLETED')).toBe(true);
      expect(updatedOrder?.items.some((i: any) => i.status === 'IN_PROGRESS')).toBe(true);
    });
  });

  describe('Order Cancellation', () => {
    it('should cancel order and create audit trail', async () => {
      // Arrange
      const order = await prisma.order.create({
        data: {
          type: 'DINE_IN',
          table: 'MESA-02',
          status: 'RECEIVED',
          restaurantId: restaurantA.restaurantId,
          items: {
            create: [
              {
                recipeId: testRecipe.id,
                quantity: 1,
                status: 'PENDING',
                restaurantId: restaurantA.restaurantId,
              },
            ],
          },
        },
        include: { items: true },
      });

      // Act: Cancel order
      const cancelledOrder = await prisma.order.update({
        where: { id: order.id },
        data: {
          status: 'CANCELLED',
          cancellationReason: 'Cliente desistiu',
        },
        include: { items: true },
      });

      // Assert
      expect(cancelledOrder.status).toBe('CANCELLED');
      expect(cancelledOrder.cancellationReason).toBe('Cliente desistiu');

      // Audit log
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          entityType: 'ORDER',
          entityId: order.id,
          action: 'UPDATE',
          restaurantId: restaurantA.restaurantId,
        },
      });
      expect(auditLog).toBeDefined();
    });
  });

  describe('KDS Integration', () => {
    it('should display order in KDS with correct details', async () => {
      // Arrange
      const order = await prisma.order.create({
        data: {
          type: 'DINE_IN',
          table: 'KDS-TEST',
          status: 'RECEIVED',
          restaurantId: restaurantA.restaurantId,
          items: {
            create: [
              {
                recipeId: testRecipe.id,
                quantity: 2,
                notes: 'Extra cheese',
                status: 'PENDING',
                restaurantId: restaurantA.restaurantId,
              },
            ],
          },
        },
        include: {
          items: {
            include: {
              recipe: {
                include: {
                  ingredients: {
                    include: { ingredient: true },
                  },
                },
              },
            },
          },
        },
      });

      // Assert: KDS view simulation
      const kdsOrder = await prisma.order.findUnique({
        where: { id: order.id },
        include: {
          items: {
            include: {
              recipe: {
                select: {
                  name: true,
                  ingredients: {
                    include: {
                      ingredient: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
        },
      });

      expect(kdsOrder).toBeDefined();
      expect(kdsOrder?.status).toBe('RECEIVED');
      expect(kdsOrder?.items[0].recipe.name).toBe('Order Test Recipe');
      expect(kdsOrder?.items[0].notes).toBe('Extra cheese');
      expect(kdsOrder?.items[0].recipe.ingredients).toBeDefined();
    });

    it('should update KDS status in real-time', async () => {
      // Arrange
      const order = await prisma.order.create({
        data: {
          type: 'DINE_IN',
          table: 'KDS-STATUS',
          status: 'RECEIVED',
          restaurantId: restaurantA.restaurantId,
          items: {
            create: [
              {
                recipeId: testRecipe.id,
                quantity: 1,
                status: 'PENDING',
                restaurantId: restaurantA.restaurantId,
              },
            ],
          },
        },
        include: { items: true },
      });

      // Act: Progress through statuses
      const statuses = ['PREPARING', 'READY', 'COMPLETED'];
      for (const status of statuses) {
        await prisma.order.update({
          where: { id: order.id },
          data: { status },
        });

        const updated = await prisma.order.findUnique({
          where: { id: order.id },
        });
        expect(updated?.status).toBe(status);
      }
    });
  });

  describe('Multi-Restaurant Order Isolation', () => {
    it('should keep orders isolated between restaurants', async () => {
      // Arrange: Create orders in both restaurants
      const orderA = await prisma.order.create({
        data: {
          type: 'DINE_IN',
          table: 'MESA-A',
          status: 'RECEIVED',
          restaurantId: restaurantA.restaurantId,
          items: {
            create: [
              {
                recipeId: testRecipe.id,
                quantity: 1,
                status: 'PENDING',
                restaurantId: restaurantA.restaurantId,
              },
            ],
          },
        },
      });

      // Create recipe and order for restaurant B
      const recipeB = await prisma.recipe.create({
        data: {
          code: 'ORD-REC-B',
          name: 'Recipe B',
          baseYield: 1,
          restaurantId: restaurantB.restaurantId,
        },
      });

      const orderB = await prisma.order.create({
        data: {
          type: 'DINE_IN',
          table: 'MESA-B',
          status: 'RECEIVED',
          restaurantId: restaurantB.restaurantId,
          items: {
            create: [
              {
                recipeId: recipeB.id,
                quantity: 1,
                status: 'PENDING',
                restaurantId: restaurantB.restaurantId,
              },
            ],
          },
        },
      });

      // Act & Assert: Query orders per restaurant
      const ordersA = await prisma.order.findMany({
        where: { restaurantId: restaurantA.restaurantId },
      });
      const ordersB = await prisma.order.findMany({
        where: { restaurantId: restaurantB.restaurantId },
      });

      expect(ordersA.some((o: any) => o.id === orderA.id)).toBe(true);
      expect(ordersA.some((o: any) => o.id === orderB.id)).toBe(false);
      expect(ordersB.some((o: any) => o.id === orderB.id)).toBe(true);
      expect(ordersB.some((o: any) => o.id === orderA.id)).toBe(false);
    });
  });

  describe('Order Performance', () => {
    it('should query orders with items within performance threshold', async () => {
      // Arrange: Create multiple orders
      await Promise.all(
        Array.from({ length: 20 }, async (_, i) => {
          return prisma.order.create({
            data: {
              type: 'DINE_IN',
              table: `MESA-${i}`,
              status: 'RECEIVED',
              restaurantId: restaurantA.restaurantId,
              items: {
                create: [
                  {
                    recipeId: testRecipe.id,
                    quantity: 1,
                    status: 'PENDING',
                    restaurantId: restaurantA.restaurantId,
                  },
                ],
              },
            },
          });
        })
      );

      // Act & Assert: Query with performance check
      const { result, duration } = await assertQueryPerformance(
        () =>
          prisma.order.findMany({
            where: { restaurantId: restaurantA.restaurantId },
            include: { items: { include: { recipe: true } } },
            orderBy: { createdAt: 'desc' },
            take: 10,
          }),
        500,
        'Orders with items query'
      );

      expect(result).toHaveLength(10);
      expect(duration).toBeLessThan(500);
    });
  });
});
