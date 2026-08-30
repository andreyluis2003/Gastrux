// @ts-nocheck
/**
 * Database Query Performance Tests
 * Validates query execution times, index usage, and optimization
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { assertQueryPerformance, assertNoNPlusOne } from '../helpers/db-assertions';
import {
  createMultiRestaurantScenario,
  createUserWithRole,
  cleanupMultiTenantData,
} from '../helpers/multi-tenant';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('Database Query Performance Tests', () => {
  let restaurantA: { restaurantId: string; ownerId: string };
  let userA: { userId: string; email: string };

  beforeAll(async () => {
    const scenario = await createMultiRestaurantScenario();
    restaurantA = scenario.restaurantA;
    userA = await createUserWithRole(restaurantA.restaurantId, 'OWNER', 'owner-perf@test.com');

    // Seed performance test data
    await seedPerformanceData();
  });

  afterAll(async () => {
    await cleanupMultiTenantData([restaurantA.restaurantId]);
    await prisma.$disconnect();
  });

  async function seedPerformanceData() {
    // Create categories
    const categories = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        prisma.ingredientCategory.create({
          data: {
            name: `Category ${i}`,
            restaurantId: restaurantA.restaurantId,
          },
        })
      )
    );

    // Create ingredients
    const ingredients = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        prisma.ingredient.create({
          data: {
            code: `PERF-ING-${i.toString().padStart(3, '0')}`,
            name: `Performance Ingredient ${i}`,
            unit: ['KG', 'L', 'UN', 'G', 'ML'][i % 5],
            minimumStock: 10 + (i % 20),
            currentStock: 50 + (i % 100),
            restaurantId: restaurantA.restaurantId,
            categoryId: categories[i % 5].id,
          },
        })
      )
    );

    // Create stock entries
    await Promise.all(
      ingredients.map((ing) =>
        prisma.stock.create({
          data: {
            ingredientId: ing.id,
            quantity: ing.currentStock,
            restaurantId: restaurantA.restaurantId,
          },
        })
      )
    );

    // Create recipes
    const recipes = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        prisma.recipe.create({
          data: {
            code: `PERF-REC-${i.toString().padStart(3, '0')}`,
            name: `Performance Recipe ${i}`,
            description: `Description for recipe ${i}`,
            baseYield: 1 + (i % 10),
            restaurantId: restaurantA.restaurantId,
            ingredients: {
              create: [
                {
                  ingredientId: ingredients[i % 50].id,
                  quantity: 0.5 + (i % 5) * 0.1,
                  unit: 'KG',
                  restaurantId: restaurantA.restaurantId,
                },
                {
                  ingredientId: ingredients[(i + 1) % 50].id,
                  quantity: 0.3 + (i % 3) * 0.1,
                  unit: 'KG',
                  restaurantId: restaurantA.restaurantId,
                },
              ],
            },
          },
        })
      )
    );

    // Create orders with items
    await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        prisma.order.create({
          data: {
            type: ['DINE_IN', 'DELIVERY', 'TAKEAWAY'][i % 3],
            table: `MESA-${i}`,
            status: ['RECEIVED', 'PREPARING', 'READY', 'COMPLETED'][i % 4],
            restaurantId: restaurantA.restaurantId,
            total: 50 + (i % 20) * 5,
            items: {
              create: [
                {
                  recipeId: recipes[i % 20].id,
                  quantity: 1 + (i % 3),
                  unitPrice: 25 + (i % 10),
                  status: 'COMPLETED',
                  restaurantId: restaurantA.restaurantId,
                },
                {
                  recipeId: recipes[(i + 1) % 20].id,
                  quantity: 1,
                  unitPrice: 30 + (i % 15),
                  status: 'COMPLETED',
                  restaurantId: restaurantA.restaurantId,
                },
              ],
            },
          },
        })
      )
    );

    // Create stock movements
    await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        prisma.stockMovement.create({
          data: {
            ingredientId: ingredients[i % 50].id,
            quantity: 1 + (i % 20),
            type: ['ENTRY', 'WITHDRAWAL', 'ADJUSTMENT'][i % 3],
            reason: `Performance seed ${i}`,
            restaurantId: restaurantA.restaurantId,
            createdById: userA.userId,
          },
        })
      )
    );

    // Create financial transactions
    await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        prisma.financialTransaction.create({
          data: {
            type: ['INCOME', 'EXPENSE'][i % 2] as 'INCOME' | 'EXPENSE',
            amount: 50 + (i % 100),
            description: `Transaction ${i}`,
            category: ['Vendas', 'Matéria Prima', 'Operacional'][i % 3],
            status: 'COMPLETED',
            restaurantId: restaurantA.restaurantId,
            createdById: userA.userId,
            date: new Date(Date.now() - (i % 30) * 24 * 60 * 60 * 1000),
          },
        })
      )
    );
  }

  describe('Complex Join Operations', () => {
    it('should query orders with items and recipes within threshold', async () => {
      const { result, duration } = await assertQueryPerformance(
        () =>
          prisma.order.findMany({
            where: { restaurantId: restaurantA.restaurantId },
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
            take: 20,
          }),
        500,
        'Orders with nested recipe ingredients'
      );

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(500);
    });

    it('should query ingredients with stock and categories efficiently', async () => {
      const { result, duration } = await assertQueryPerformance(
        () =>
          prisma.ingredient.findMany({
            where: { restaurantId: restaurantA.restaurantId },
            include: {
              category: true,
              currentStock: true,
              suppliers: true,
            },
            take: 30,
          }),
        500,
        'Ingredients with category and stock'
      );

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(500);
    });

    it('should query recipes with full ingredient details', async () => {
      const { result, duration } = await assertQueryPerformance(
        () =>
          prisma.recipe.findMany({
            where: { restaurantId: restaurantA.restaurantId },
            include: {
              ingredients: {
                include: {
                  ingredient: {
                    include: {
                      currentStock: true,
                      category: true,
                    },
                  },
                },
              },
            },
            take: 15,
          }),
        500,
        'Recipes with ingredient details'
      );

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(500);
    });
  });

  describe('Aggregate Queries', () => {
    it('should aggregate revenue by day efficiently', async () => {
      const { result, duration } = await assertQueryPerformance(
        () =>
          prisma.financialTransaction.groupBy({
            by: ['date'],
            where: {
              restaurantId: restaurantA.restaurantId,
              type: 'INCOME',
              status: 'COMPLETED',
            },
            _sum: { amount: true },
            _count: { id: true },
            orderBy: { date: 'desc' },
            take: 30,
          }),
        500,
        'Daily revenue aggregation'
      );

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(500);
    });

    it('should calculate inventory value efficiently', async () => {
      const { result, duration } = await assertQueryPerformance(
        () =>
          prisma.stock.findMany({
            where: { restaurantId: restaurantA.restaurantId },
            include: {
              ingredient: {
                select: {
                  name: true,
                  referenceCost: true,
                },
              },
            },
          }),
        500,
        'Inventory value calculation'
      );

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(500);
    });

    it('should count items by category efficiently', async () => {
      const { result, duration } = await assertQueryPerformance(
        () =>
          prisma.ingredient.groupBy({
            by: ['categoryId'],
            where: { restaurantId: restaurantA.restaurantId },
            _count: { id: true },
          }),
        500,
        'Items count by category'
      );

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(500);
    });

    it('should aggregate stock movements by type efficiently', async () => {
      const { result, duration } = await assertQueryPerformance(
        () =>
          prisma.stockMovement.groupBy({
            by: ['type'],
            where: { restaurantId: restaurantA.restaurantId },
            _sum: { quantity: true },
            _count: { id: true },
          }),
        500,
        'Stock movements by type'
      );

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(500);
    });
  });

  describe('Search Optimization', () => {
    it('should search ingredients by name efficiently', async () => {
      const { result, duration } = await assertQueryPerformance(
        () =>
          prisma.ingredient.findMany({
            where: {
              restaurantId: restaurantA.restaurantId,
              name: { contains: 'Ingredient' },
            },
            take: 20,
          }),
        500,
        'Ingredient name search'
      );

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(500);
    });

    it('should filter orders by status efficiently', async () => {
      const { result, duration } = await assertQueryPerformance(
        () =>
          prisma.order.findMany({
            where: {
              restaurantId: restaurantA.restaurantId,
              status: 'COMPLETED',
            },
            include: { items: true },
            take: 20,
          }),
        500,
        'Orders by status filter'
      );

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(500);
    });

    it('should query recent transactions efficiently', async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { result, duration } = await assertQueryPerformance(
        () =>
          prisma.financialTransaction.findMany({
            where: {
              restaurantId: restaurantA.restaurantId,
              date: { gte: thirtyDaysAgo },
            },
            orderBy: { date: 'desc' },
            take: 50,
          }),
        500,
        'Recent transactions query'
      );

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(500);
    });
  });

  describe('N+1 Query Detection', () => {
    it('should not produce N+1 queries for orders with items', async () => {
      // This test verifies that Prisma's include doesn't produce N+1
      const { result, queryCount } = await assertNoNPlusOne(
        () =>
          prisma.order.findMany({
            where: { restaurantId: restaurantA.restaurantId },
            include: { items: true },
            take: 20,
          }),
        10, // Max 10 queries expected
        'Orders with items (N+1 check)'
      );

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
      expect(queryCount).toBeLessThanOrEqual(10);
    });

    it('should not produce N+1 queries for ingredients with stock', async () => {
      const { result, queryCount } = await assertNoNPlusOne(
        () =>
          prisma.ingredient.findMany({
            where: { restaurantId: restaurantA.restaurantId },
            include: { currentStock: true },
            take: 30,
          }),
        10,
        'Ingredients with stock (N+1 check)'
      );

      expect(result).toBeDefined();
      expect(queryCount).toBeLessThanOrEqual(10);
    });
  });

  describe('Pagination Performance', () => {
    it('should paginate large datasets efficiently', async () => {
      const pageSize = 10;
      const page = 2;

      const { result, duration } = await assertQueryPerformance(
        () =>
          prisma.stockMovement.findMany({
            where: { restaurantId: restaurantA.restaurantId },
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
          }),
        500,
        'Paginated stock movements'
      );

      expect(result).toBeDefined();
      expect(result.length).toBeLessThanOrEqual(pageSize);
      expect(duration).toBeLessThan(500);
    });

    it('should count total records efficiently for pagination', async () => {
      const { result, duration } = await assertQueryPerformance(
        () =>
          prisma.stockMovement.count({
            where: { restaurantId: restaurantA.restaurantId },
          }),
        500,
        'Count stock movements'
      );

      expect(result).toBeGreaterThan(0);
      expect(duration).toBeLessThan(500);
    });
  });
});
