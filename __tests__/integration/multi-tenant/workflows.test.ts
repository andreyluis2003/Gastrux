// @ts-nocheck
/**
 * Multi-Tenant Workflow Tests
 * Validates complex workflows across multiple restaurants
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import {
  createMultiRestaurantScenario,
  createRestaurantTestData,
  createUserWithRole,
  switchUserContext,
  cleanupMultiTenantData,
} from '../helpers/multi-tenant';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('Multi-Tenant Workflow Tests', () => {
  let restaurantA: { restaurantId: string; ownerId: string };
  let restaurantB: { restaurantId: string; ownerId: string };
  let userA: { userId: string; email: string };
  let userB: { userId: string; email: string };

  beforeAll(async () => {
    const scenario = await createMultiRestaurantScenario();
    restaurantA = scenario.restaurantA;
    restaurantB = scenario.restaurantB;

    userA = await createUserWithRole(restaurantA.restaurantId, 'OWNER', 'owner-workflow-a@test.com');
    userB = await createUserWithRole(restaurantB.restaurantId, 'OWNER', 'owner-workflow-b@test.com');
  });

  afterAll(async () => {
    await cleanupMultiTenantData([restaurantA.restaurantId, restaurantB.restaurantId]);
    await prisma.$disconnect();
  });

  describe('Financial Independence', () => {
    it('should track independent revenue for each restaurant', async () => {
      // Arrange: Create transactions
      await Promise.all([
        // Restaurant A revenue
        prisma.financialTransaction.create({
          data: {
            type: 'INCOME',
            amount: 1000.00,
            description: 'Restaurant A Daily Revenue',
            category: 'Vendas',
            status: 'COMPLETED',
            restaurantId: restaurantA.restaurantId,
            createdById: userA.userId,
            date: new Date(),
          },
        }),
        prisma.financialTransaction.create({
          data: {
            type: 'EXPENSE',
            amount: 300.00,
            description: 'Restaurant A Expenses',
            category: 'Matéria Prima',
            status: 'COMPLETED',
            restaurantId: restaurantA.restaurantId,
            createdById: userA.userId,
            date: new Date(),
          },
        }),
        // Restaurant B revenue
        prisma.financialTransaction.create({
          data: {
            type: 'INCOME',
            amount: 2000.00,
            description: 'Restaurant B Daily Revenue',
            category: 'Vendas',
            status: 'COMPLETED',
            restaurantId: restaurantB.restaurantId,
            createdById: userB.userId,
            date: new Date(),
          },
        }),
        prisma.financialTransaction.create({
          data: {
            type: 'EXPENSE',
            amount: 500.00,
            description: 'Restaurant B Expenses',
            category: 'Matéria Prima',
            status: 'COMPLETED',
            restaurantId: restaurantB.restaurantId,
            createdById: userB.userId,
            date: new Date(),
          },
        }),
      ]);

      // Act: Calculate totals per restaurant
      const [aIncome, aExpenses, bIncome, bExpenses] = await Promise.all([
        prisma.financialTransaction.aggregate({
          where: { restaurantId: restaurantA.restaurantId, type: 'INCOME' },
          _sum: { amount: true },
        }),
        prisma.financialTransaction.aggregate({
          where: { restaurantId: restaurantA.restaurantId, type: 'EXPENSE' },
          _sum: { amount: true },
        }),
        prisma.financialTransaction.aggregate({
          where: { restaurantId: restaurantB.restaurantId, type: 'INCOME' },
          _sum: { amount: true },
        }),
        prisma.financialTransaction.aggregate({
          where: { restaurantId: restaurantB.restaurantId, type: 'EXPENSE' },
          _sum: { amount: true },
        }),
      ]);

      // Assert: Independent calculations
      const profitA = (aIncome._sum.amount || 0) - (aExpenses._sum.amount || 0);
      const profitB = (bIncome._sum.amount || 0) - (bExpenses._sum.amount || 0);

      expect(profitA).toBe(700.00); // 1000 - 300
      expect(profitB).toBe(1500.00); // 2000 - 500
      expect(profitA).not.toBe(profitB);
    });

    it('should generate separate financial reports', async () => {
      // Act: Generate reports for each restaurant
      const [reportA, reportB] = await Promise.all([
        prisma.financialTransaction.groupBy({
          by: ['category'],
          where: { restaurantId: restaurantA.restaurantId },
          _sum: { amount: true },
          _count: { id: true },
        }),
        prisma.financialTransaction.groupBy({
          by: ['category'],
          where: { restaurantId: restaurantB.restaurantId },
          _sum: { amount: true },
          _count: { id: true },
        }),
      ]);

      // Assert: Independent reports
      expect(reportA).toBeDefined();
      expect(reportB).toBeDefined();

      // Categories should be independent
      const categoriesA = reportA.map((r: any) => r.category);
      const categoriesB = reportB.map((r: any) => r.category);

      // Both should have their own data
      expect(categoriesA.length).toBeGreaterThan(0);
      expect(categoriesB.length).toBeGreaterThan(0);
    });
  });

  describe('User Context Switching', () => {
    it('should switch user context between restaurants', async () => {
      // Arrange: Create user with access to both restaurants
      const multiRestaurantUser = await prisma.user.create({
        data: {
          email: 'multi-restaurant@test.com',
          name: 'Multi Restaurant User',
          password: 'hashed_password',
          role: 'MANAGER',
          currentRestaurantId: restaurantA.restaurantId,
          active: true,
        },
      });

      await prisma.restaurantUser.create({
        data: {
          restaurantId: restaurantA.restaurantId,
          userId: multiRestaurantUser.id,
          role: 'MANAGER',
        },
      });

      await prisma.restaurantUser.create({
        data: {
          restaurantId: restaurantB.restaurantId,
          userId: multiRestaurantUser.id,
          role: 'MANAGER',
        },
      });

      // Act: Switch context to restaurant B
      await switchUserContext(multiRestaurantUser.id, restaurantB.restaurantId);

      // Assert: Context updated
      const updatedUser = await prisma.user.findUnique({
        where: { id: multiRestaurantUser.id },
      });
      expect(updatedUser?.currentRestaurantId).toBe(restaurantB.restaurantId);

      // Switch back to A
      await switchUserContext(multiRestaurantUser.id, restaurantA.restaurantId);

      const switchedBack = await prisma.user.findUnique({
        where: { id: multiRestaurantUser.id },
      });
      expect(switchedBack?.currentRestaurantId).toBe(restaurantA.restaurantId);
    });

    it('should apply correct permissions per restaurant', async () => {
      // Arrange: Create user with different roles in different restaurants
      const user = await prisma.user.create({
        data: {
          email: 'different-roles@test.com',
          name: 'Different Roles User',
          password: 'hashed_password',
          role: 'MANAGER',
          currentRestaurantId: restaurantA.restaurantId,
          active: true,
        },
      });

      await prisma.restaurantUser.create({
        data: {
          restaurantId: restaurantA.restaurantId,
          userId: user.id,
          role: 'MANAGER',
        },
      });

      await prisma.restaurantUser.create({
        data: {
          restaurantId: restaurantB.restaurantId,
          userId: user.id,
          role: 'COOK', // Different role!
        },
      });

      // Act: Get roles per restaurant
      const rolesA = await prisma.restaurantUser.findFirst({
        where: {
          restaurantId: restaurantA.restaurantId,
          userId: user.id,
        },
      });

      const rolesB = await prisma.restaurantUser.findFirst({
        where: {
          restaurantId: restaurantB.restaurantId,
          userId: user.id,
        },
      });

      // Assert: Different roles per restaurant
      expect(rolesA?.role).toBe('MANAGER');
      expect(rolesB?.role).toBe('COOK');
    });
  });

  describe('Shared Resource Access', () => {
    it('should allow global settings access across restaurants', async () => {
      // Note: In a real implementation, global settings would be in a separate table
      // This test validates the concept

      // Arrange: Create a "global" setting in restaurant A
      const globalSetting = await prisma.chartOfAccount.create({
        data: {
          code: 'GLOBAL-001',
          name: 'Global Setting',
          type: 'REVENUE',
          restaurantId: restaurantA.restaurantId,
        },
      });

      // Act: Restaurant B creates its own version
      const localSetting = await prisma.chartOfAccount.create({
        data: {
          code: 'GLOBAL-001',
          name: 'Global Setting',
          type: 'REVENUE',
          restaurantId: restaurantB.restaurantId,
        },
      });

      // Assert: Both exist independently
      const foundA = await prisma.chartOfAccount.findUnique({
        where: { id: globalSetting.id },
      });

      const foundB = await prisma.chartOfAccount.findUnique({
        where: { id: localSetting.id },
      });

      expect(foundA?.restaurantId).toBe(restaurantA.restaurantId);
      expect(foundB?.restaurantId).toBe(restaurantB.restaurantId);
      expect(foundA?.id).not.toBe(foundB?.id);
    });
  });

  describe('Inventory Consolidation', () => {
    it('should consolidate shopping lists per restaurant', async () => {
      // Arrange: Create ingredients and needs
      const ingredientsA = await Promise.all([
        prisma.ingredient.create({
          data: {
            code: 'CONS-A-1',
            name: 'Consolidation A 1',
            unit: 'KG',
            minimumStock: 20,
            currentStock: 5,
            restaurantId: restaurantA.restaurantId,
          },
        }),
        prisma.ingredient.create({
          data: {
            code: 'CONS-A-2',
            name: 'Consolidation A 2',
            unit: 'KG',
            minimumStock: 30,
            currentStock: 10,
            restaurantId: restaurantA.restaurantId,
          },
        }),
      ]);

      const ingredientsB = await Promise.all([
        prisma.ingredient.create({
          data: {
            code: 'CONS-B-1',
            name: 'Consolidation B 1',
            unit: 'KG',
            minimumStock: 15,
            currentStock: 8,
            restaurantId: restaurantB.restaurantId,
          },
        }),
      ]);

      // Act: Create shopping lists per restaurant
      const [listA, listB] = await Promise.all([
        prisma.shoppingList.create({
          data: {
            name: 'Lista Restaurante A',
            status: 'PENDING',
            restaurantId: restaurantA.restaurantId,
            items: {
              create: ingredientsA.map((ing) => ({
                ingredientId: ing.id,
                quantity: ing.minimumStock - ing.currentStock,
                unit: ing.unit,
                restaurantId: restaurantA.restaurantId,
              })),
            },
          },
        }),
        prisma.shoppingList.create({
          data: {
            name: 'Lista Restaurante B',
            status: 'PENDING',
            restaurantId: restaurantB.restaurantId,
            items: {
              create: ingredientsB.map((ing) => ({
                ingredientId: ing.id,
                quantity: ing.minimumStock - ing.currentStock,
                unit: ing.unit,
                restaurantId: restaurantB.restaurantId,
              })),
            },
          },
        }),
      ]);

      // Assert: Independent lists
      const itemsA = await prisma.shoppingListItem.findMany({
        where: { shoppingListId: listA.id },
      });

      const itemsB = await prisma.shoppingListItem.findMany({
        where: { shoppingListId: listB.id },
      });

      expect(itemsA).toHaveLength(2);
      expect(itemsB).toHaveLength(1);

      // Verify quantities are correct
      expect(itemsA[0].quantity).toBe(15); // 20 - 5
      expect(itemsA[1].quantity).toBe(20); // 30 - 10
      expect(itemsB[0].quantity).toBe(7); // 15 - 8
    });
  });

  describe('Staff Management Isolation', () => {
    it('should manage staff independently per restaurant', async () => {
      // Arrange: Create staff in both restaurants
      const [staffA, staffB] = await Promise.all([
        prisma.staffMember.create({
          data: {
            name: 'Funcionário A',
            role: 'COOK',
            phone: '+55 11 91111-1111',
            email: 'staff-a@restaurante.com',
            hourlyRate: 18.50,
            restaurantId: restaurantA.restaurantId,
          },
        }),
        prisma.staffMember.create({
          data: {
            name: 'Funcionário B',
            role: 'MANAGER',
            phone: '+55 11 92222-2222',
            email: 'staff-b@restaurante.com',
            hourlyRate: 25.00,
            restaurantId: restaurantB.restaurantId,
          },
        }),
      ]);

      // Act: Query staff per restaurant
      const staffInA = await prisma.staffMember.findMany({
        where: { restaurantId: restaurantA.restaurantId },
      });

      const staffInB = await prisma.staffMember.findMany({
        where: { restaurantId: restaurantB.restaurantId },
      });

      // Assert: Isolated staff lists
      expect(staffInA.map((s: any) => s.id)).toContain(staffA.id);
      expect(staffInA.map((s: any) => s.id)).not.toContain(staffB.id);

      expect(staffInB.map((s: any) => s.id)).toContain(staffB.id);
      expect(staffInB.map((s: any) => s.id)).not.toContain(staffA.id);
    });

    it('should track attendance per restaurant', async () => {
      // Arrange: Create staff and attendance records
      const staffA = await prisma.staffMember.create({
        data: {
          name: 'Attendance A',
          role: 'COOK',
          hourlyRate: 18.50,
          restaurantId: restaurantA.restaurantId,
        },
      });

      const staffB = await prisma.staffMember.create({
        data: {
          name: 'Attendance B',
          role: 'COOK',
          hourlyRate: 18.50,
          restaurantId: restaurantB.restaurantId,
        },
      });

      // Create attendance records
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      await Promise.all([
        prisma.attendance.create({
          data: {
            staffId: staffA.id,
            date: today,
            clockIn: new Date(today.getTime() + 8 * 60 * 60 * 1000), // 08:00
            clockOut: new Date(today.getTime() + 17 * 60 * 60 * 1000), // 17:00
            hoursWorked: 9,
            restaurantId: restaurantA.restaurantId,
          },
        }),
        prisma.attendance.create({
          data: {
            staffId: staffB.id,
            date: today,
            clockIn: new Date(today.getTime() + 9 * 60 * 60 * 1000), // 09:00
            clockOut: new Date(today.getTime() + 18 * 60 * 60 * 1000), // 18:00
            hoursWorked: 9,
            restaurantId: restaurantB.restaurantId,
          },
        }),
      ]);

      // Act: Calculate hours per restaurant
      const [hoursA, hoursB] = await Promise.all([
        prisma.attendance.aggregate({
          where: { restaurantId: restaurantA.restaurantId },
          _sum: { hoursWorked: true },
        }),
        prisma.attendance.aggregate({
          where: { restaurantId: restaurantB.restaurantId },
          _sum: { hoursWorked: true },
        }),
      ]);

      // Assert: Independent tracking
      expect(hoursA._sum.hoursWorked).toBe(9);
      expect(hoursB._sum.hoursWorked).toBe(9);
    });
  });

  describe('Production Planning Isolation', () => {
    it('should create independent production plans', async () => {
      // Arrange: Create recipes
      const recipeA = await prisma.recipe.create({
        data: {
          code: 'PROD-A',
          name: 'Production Recipe A',
          baseYield: 10,
          restaurantId: restaurantA.restaurantId,
        },
      });

      const recipeB = await prisma.recipe.create({
        data: {
          code: 'PROD-B',
          name: 'Production Recipe B',
          baseYield: 15,
          restaurantId: restaurantB.restaurantId,
        },
      });

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      // Act: Create production plans
      const [planA, planB] = await Promise.all([
        prisma.productionPlan.create({
          data: {
            planDate: tomorrow,
            status: 'PLANNED',
            restaurantId: restaurantA.restaurantId,
            items: {
              create: [
                {
                  recipeId: recipeA.id,
                  quantity: 20,
                  restaurantId: restaurantA.restaurantId,
                },
              ],
            },
          },
        }),
        prisma.productionPlan.create({
          data: {
            planDate: tomorrow,
            status: 'PLANNED',
            restaurantId: restaurantB.restaurantId,
            items: {
              create: [
                {
                  recipeId: recipeB.id,
                  quantity: 30,
                  restaurantId: restaurantB.restaurantId,
                },
              ],
            },
          },
        }),
      ]);

      // Assert: Independent plans
      const plansA = await prisma.productionPlan.findMany({
        where: { restaurantId: restaurantA.restaurantId },
      });

      const plansB = await prisma.productionPlan.findMany({
        where: { restaurantId: restaurantB.restaurantId },
      });

      expect(plansA.map((p: any) => p.id)).toContain(planA.id);
      expect(plansA.map((p: any) => p.id)).not.toContain(planB.id);

      expect(plansB.map((p: any) => p.id)).toContain(planB.id);
      expect(plansB.map((p: any) => p.id)).not.toContain(planA.id);
    });
  });
});
