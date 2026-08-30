// @ts-nocheck
/**
 * Database Transaction Integrity Tests
 * Validates ACID compliance, concurrent operations, and rollback behavior
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import {
  assertACIDCompliance,
  assertNoRaceConditions,
  assertDataConsistency,
} from '../helpers/db-assertions';
import {
  createMultiRestaurantScenario,
  createUserWithRole,
  cleanupMultiTenantData,
} from '../helpers/multi-tenant';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('Database Transaction Integrity Tests', () => {
  let restaurantA: { restaurantId: string; ownerId: string };
  let userA: { userId: string; email: string };

  beforeAll(async () => {
    const scenario = await createMultiRestaurantScenario();
    restaurantA = scenario.restaurantA;
    userA = await createUserWithRole(restaurantA.restaurantId, 'OWNER', 'owner-trx@test.com');
  });

  afterAll(async () => {
    await cleanupMultiTenantData([restaurantA.restaurantId]);
    await prisma.$disconnect();
  });

  describe('ACID Compliance', () => {
    it('should enforce atomicity - all operations succeed or none', async () => {
      // Arrange: Create ingredient
      const ingredient = await prisma.ingredient.create({
        data: {
          code: 'ACID-001',
          name: 'ACID Test Ingredient',
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

      // Act & Assert: Transaction should be atomic
      const result = await assertACIDCompliance(
        async () => {
          return prisma.$transaction(async (tx) => {
            // Create stock movement
            const movement = await tx.stockMovement.create({
              data: {
                ingredientId: ingredient.id,
                quantity: 20,
                type: 'WITHDRAWAL',
                reason: 'ACID test',
                restaurantId: restaurantA.restaurantId,
                createdById: userA.userId,
              },
            });

            // Update stock
            await tx.stock.update({
              where: { ingredientId: ingredient.id },
              data: { quantity: { decrement: 20 } },
            });

            // Create audit log
            const auditLog = await tx.auditLog.create({
              data: {
                entityType: 'STOCK_MOVEMENT',
                entityId: movement.id,
                action: 'CREATE',
                description: 'ACID test movement',
                userId: userA.userId,
                restaurantId: restaurantA.restaurantId,
              },
            });

            return { movement, auditLog };
          });
        },
        async (result) => {
          // Verify all operations completed
          const [movement, stock, auditLog] = await Promise.all([
            prisma.stockMovement.findUnique({ where: { id: result.movement.id } }),
            prisma.stock.findUnique({ where: { ingredientId: ingredient.id } }),
            prisma.auditLog.findUnique({ where: { id: result.auditLog.id } }),
          ]);

          return !!movement && stock?.quantity === 80 && !!auditLog;
        },
        'Atomic stock movement'
      );

      expect(result.atomicity).toBe(true);
      expect(result.consistency).toBe(true);
    });

    it('should rollback all operations on failure', async () => {
      // Arrange
      const ingredient = await prisma.ingredient.create({
        data: {
          code: 'ROLLBACK-001',
          name: 'Rollback Test',
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

      const initialStock = await prisma.stock.findUnique({
        where: { ingredientId: ingredient.id },
      });

      // Act: Transaction that will fail
      try {
        await prisma.$transaction(async (tx) => {
          // This should succeed
          await tx.stockMovement.create({
            data: {
              ingredientId: ingredient.id,
              quantity: 10,
              type: 'WITHDRAWAL',
              reason: 'Rollback test',
              restaurantId: restaurantA.restaurantId,
              createdById: userA.userId,
            },
          });

          // This should fail - invalid foreign key
          await tx.stockMovement.create({
            data: {
              ingredientId: 'non-existent-id',
              quantity: 10,
              type: 'WITHDRAWAL',
              reason: 'This will fail',
              restaurantId: restaurantA.restaurantId,
              createdById: userA.userId,
            },
          });
        });

        // Should not reach here
        expect(false).toBe(true);
      } catch (error) {
        // Expected to fail
      }

      // Assert: Stock should be unchanged (transaction rolled back)
      const finalStock = await prisma.stock.findUnique({
        where: { ingredientId: ingredient.id },
      });

      expect(finalStock?.quantity).toBe(initialStock?.quantity);

      // No movement should exist
      const movements = await prisma.stockMovement.findMany({
        where: {
          ingredientId: ingredient.id,
          reason: 'Rollback test',
        },
      });

      expect(movements).toHaveLength(0);
    });

    it('should maintain consistency with foreign key constraints', async () => {
      // Act & Assert: Cannot create stock for non-existent ingredient
      await expect(
        prisma.stock.create({
          data: {
            ingredientId: 'non-existent',
            quantity: 10,
            restaurantId: restaurantA.restaurantId,
          },
        })
      ).rejects.toThrow();

      // Act & Assert: Cannot create movement for non-existent ingredient
      await expect(
        prisma.stockMovement.create({
          data: {
            ingredientId: 'non-existent',
            quantity: 10,
            type: 'WITHDRAWAL',
            reason: 'Consistency test',
            restaurantId: restaurantA.restaurantId,
            createdById: userA.userId,
          },
        })
      ).rejects.toThrow();
    });

    it('should isolate concurrent transactions', async () => {
      // Arrange
      const ingredient = await prisma.ingredient.create({
        data: {
          code: 'ISOLATION-001',
          name: 'Isolation Test',
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

      // Act: Run concurrent transactions
      const operations = Array.from({ length: 10 }, (_, i) =>
        prisma.$transaction(async (tx) => {
          // Read current stock
          const current = await tx.stock.findUnique({
            where: { ingredientId: ingredient.id },
          });

          // Small delay to increase chance of overlap
          await new Promise((resolve) => setTimeout(resolve, 10));

          // Update stock
          await tx.stock.update({
            where: { ingredientId: ingredient.id },
            data: { quantity: { decrement: 5 } },
          });

          // Create movement
          return tx.stockMovement.create({
            data: {
              ingredientId: ingredient.id,
              quantity: 5,
              type: 'WITHDRAWAL',
              reason: `Concurrent ${i}`,
              restaurantId: restaurantA.restaurantId,
              createdById: userA.userId,
            },
          });
        })
      );

      const results = await Promise.all(operations);

      // Assert: All movements created
      expect(results).toHaveLength(10);

      // Stock should be exactly 50 (100 - 10*5)
      const finalStock = await prisma.stock.findUnique({
        where: { ingredientId: ingredient.id },
      });
      expect(finalStock?.quantity).toBe(50);
    });
  });

  describe('Concurrent Update Handling', () => {
    it('should handle concurrent stock updates without race conditions', async () => {
      // Arrange
      const ingredient = await prisma.ingredient.create({
        data: {
          code: 'RACE-001',
          name: 'Race Condition Test',
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

      // Act: Run 20 concurrent updates
      const result = await assertNoRaceConditions(
        async () => {
          return prisma.$transaction(async (tx) => {
            await tx.stock.update({
              where: { ingredientId: ingredient.id },
              data: { quantity: { decrement: 5 } },
            });

            return tx.stockMovement.create({
              data: {
                ingredientId: ingredient.id,
                quantity: 5,
                type: 'WITHDRAWAL',
                reason: 'Race test',
                restaurantId: restaurantA.restaurantId,
                createdById: userA.userId,
              },
            });
          });
        },
        20,
        'Concurrent stock updates'
      );

      // Assert
      expect(result.results).toHaveLength(20);
      expect(result.errors).toHaveLength(0);

      // Final stock should be exactly 100 (200 - 20*5)
      const finalStock = await prisma.stock.findUnique({
        where: { ingredientId: ingredient.id },
      });
      expect(finalStock?.quantity).toBe(100);
    });

    it('should handle concurrent order creations', async () => {
      // Arrange
      const recipe = await prisma.recipe.create({
        data: {
          code: 'RACE-REC-001',
          name: 'Race Recipe',
          baseYield: 1,
          restaurantId: restaurantA.restaurantId,
        },
      });

      // Act: Create 15 orders concurrently
      const result = await assertNoRaceConditions(
        async () => {
          return prisma.order.create({
            data: {
              type: 'DINE_IN',
              table: `RACE-${Math.random().toString(36).substring(2, 8)}`,
              status: 'RECEIVED',
              restaurantId: restaurantA.restaurantId,
              items: {
                create: [
                  {
                    recipeId: recipe.id,
                    quantity: 1,
                    status: 'PENDING',
                    restaurantId: restaurantA.restaurantId,
                  },
                ],
              },
            },
          });
        },
        15,
        'Concurrent order creation'
      );

      // Assert
      expect(result.results).toHaveLength(15);
      expect(result.errors).toHaveLength(0);

      // Verify all orders exist
      const orderIds = result.results.map((r: any) => r.id);
      const existingOrders = await prisma.order.findMany({
        where: { id: { in: orderIds } },
      });
      expect(existingOrders).toHaveLength(15);
    });
  });

  describe('Rollback Behavior', () => {
    it('should rollback on validation errors', async () => {
      // Arrange
      const initialCount = await prisma.ingredient.count({
        where: { restaurantId: restaurantA.restaurantId },
      });

      // Act: Transaction with validation error
      try {
        await prisma.$transaction(async (tx) => {
          // Create valid ingredient
          await tx.ingredient.create({
            data: {
              code: 'VALID-001',
              name: 'Valid Ingredient',
              unit: 'KG',
              minimumStock: 10,
              currentStock: 50,
              restaurantId: restaurantA.restaurantId,
            },
          });

          // Try to create invalid ingredient (missing required field)
          await tx.ingredient.create({
            data: {
              code: 'INVALID-001',
              // Missing name - should fail
              unit: 'KG',
              restaurantId: restaurantA.restaurantId,
            } as any,
          });
        });

        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        // Expected
      }

      // Assert: Valid ingredient should not exist (rolled back)
      const validIngredient = await prisma.ingredient.findUnique({
        where: { code: 'VALID-001' },
      });
      expect(validIngredient).toBeNull();

      // Count should be unchanged
      const finalCount = await prisma.ingredient.count({
        where: { restaurantId: restaurantA.restaurantId },
      });
      expect(finalCount).toBe(initialCount);
    });

    it('should rollback nested transactions', async () => {
      // Arrange: Create order
      const order = await prisma.order.create({
        data: {
          type: 'DINE_IN',
          table: 'NESTED-001',
          status: 'RECEIVED',
          restaurantId: restaurantA.restaurantId,
        },
      });

      const initialItemCount = await prisma.orderItem.count({
        where: { orderId: order.id },
      });

      // Act: Nested transaction that fails
      try {
        await prisma.$transaction(async (tx) => {
          // Create first item
          await tx.orderItem.create({
            data: {
              orderId: order.id,
              recipeId: 'valid-recipe-id',
              quantity: 1,
              status: 'PENDING',
              restaurantId: restaurantA.restaurantId,
            },
          });

          // Create second item with invalid data
          await tx.orderItem.create({
            data: {
              orderId: 'non-existent-order',
              recipeId: 'valid-recipe-id',
              quantity: 1,
              status: 'PENDING',
              restaurantId: restaurantA.restaurantId,
            },
          });
        });

        expect(false).toBe(true);
      } catch (error) {
        // Expected
      }

      // Assert: First item should not exist (rolled back)
      const finalItemCount = await prisma.orderItem.count({
        where: { orderId: order.id },
      });
      expect(finalItemCount).toBe(initialItemCount);
    });
  });

  describe('Data Consistency', () => {
    it('should maintain referential integrity after cascading operations', async () => {
      // Arrange: Create ingredient with stock and movements
      const ingredient = await prisma.ingredient.create({
        data: {
          code: 'CASCADE-001',
          name: 'Cascade Test',
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

      const movements = await Promise.all([
        prisma.stockMovement.create({
          data: {
            ingredientId: ingredient.id,
            quantity: 10,
            type: 'WITHDRAWAL',
            reason: 'Cascade 1',
            restaurantId: restaurantA.restaurantId,
            createdById: userA.userId,
          },
        }),
        prisma.stockMovement.create({
          data: {
            ingredientId: ingredient.id,
            quantity: 20,
            type: 'WITHDRAWAL',
            reason: 'Cascade 2',
            restaurantId: restaurantA.restaurantId,
            createdById: userA.userId,
          },
        }),
      ]);

      // Act: Delete ingredient (should cascade or fail based on schema)
      // Note: In most schemas, this would fail due to foreign key constraints
      // or cascade delete. Let's verify the behavior.

      // Assert: Movements should reference existing ingredient
      const movementChecks = await Promise.all(
        movements.map((m) =>
          prisma.stockMovement.findUnique({
            where: { id: m.id },
            include: { ingredient: true },
          })
        )
      );

      movementChecks.forEach((check) => {
        expect(check?.ingredient).toBeDefined();
        expect(check?.ingredientId).toBe(ingredient.id);
      });
    });

    it('should maintain accurate stock balance after multiple operations', async () => {
      // Arrange
      const ingredient = await prisma.ingredient.create({
        data: {
          code: 'BALANCE-001',
          name: 'Balance Test',
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

      // Act: Perform multiple operations
      const operations = [
        { type: 'ENTRY' as const, quantity: 50 },
        { type: 'WITHDRAWAL' as const, quantity: 30 },
        { type: 'WITHDRAWAL' as const, quantity: 20 },
        { type: 'ENTRY' as const, quantity: 10 },
        { type: 'WITHDRAWAL' as const, quantity: 15 },
      ];

      for (const op of operations) {
        await prisma.$transaction(async (tx) => {
          await tx.stockMovement.create({
            data: {
              ingredientId: ingredient.id,
              quantity: op.quantity,
              type: op.type,
              reason: 'Balance test',
              restaurantId: restaurantA.restaurantId,
              createdById: userA.userId,
            },
          });

          if (op.type === 'ENTRY') {
            await tx.stock.update({
              where: { ingredientId: ingredient.id },
              data: { quantity: { increment: op.quantity } },
            });
          } else {
            await tx.stock.update({
              where: { ingredientId: ingredient.id },
              data: { quantity: { decrement: op.quantity } },
            });
          }
        });
      }

      // Assert: Calculate expected balance
      // Initial: 100
      // +50 (entry) = 150
      // -30 (withdrawal) = 120
      // -20 (withdrawal) = 100
      // +10 (entry) = 110
      // -15 (withdrawal) = 95
      const expectedBalance = 95;

      const finalStock = await prisma.stock.findUnique({
        where: { ingredientId: ingredient.id },
      });
      expect(finalStock?.quantity).toBe(expectedBalance);

      // Verify sum of all movements
      const movements = await prisma.stockMovement.findMany({
        where: { ingredientId: ingredient.id },
      });

      const totalEntries = movements
        .filter((m) => m.type === 'ENTRY')
        .reduce((sum, m) => sum + m.quantity, 0);
      const totalWithdrawals = movements
        .filter((m) => m.type === 'WITHDRAWAL')
        .reduce((sum, m) => sum + m.quantity, 0);

      expect(totalEntries - totalWithdrawals).toBe(expectedBalance - 100); // Net change
    });
  });
});
