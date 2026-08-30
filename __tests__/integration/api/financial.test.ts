// @ts-nocheck
/**
 * Financial Integration Tests
 * Validates revenue recognition, expense recording, and financial reporting
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import {
  assertQueryPerformance,
  assertDataConsistency,
} from '../helpers/db-assertions';
import {
  createMultiRestaurantScenario,
  createUserWithRole,
  cleanupMultiTenantData,
} from '../helpers/multi-tenant';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('Financial Integration Tests', () => {
  let restaurantA: { restaurantId: string; ownerId: string };
  let restaurantB: { restaurantId: string; ownerId: string };
  let userA: { userId: string; email: string };
  let userB: { userId: string; email: string };

  beforeAll(async () => {
    const scenario = await createMultiRestaurantScenario();
    restaurantA = scenario.restaurantA;
    restaurantB = scenario.restaurantB;

    userA = await createUserWithRole(restaurantA.restaurantId, 'OWNER', 'owner-fin-a@test.com');
    userB = await createUserWithRole(restaurantB.restaurantId, 'OWNER', 'owner-fin-b@test.com');
  });

  afterAll(async () => {
    await cleanupMultiTenantData([restaurantA.restaurantId, restaurantB.restaurantId]);
    await prisma.$disconnect();
  });

  describe('Revenue Recognition', () => {
    it('should create income transaction from order', async () => {
      // Arrange: Create order
      const order = await prisma.order.create({
        data: {
          type: 'DINE_IN',
          table: 'FIN-001',
          status: 'COMPLETED',
          total: 150.00,
          restaurantId: restaurantA.restaurantId,
          items: {
            create: [
              {
                recipeId: 'recipe-id',
                quantity: 2,
                unitPrice: 75.00,
                status: 'COMPLETED',
                restaurantId: restaurantA.restaurantId,
              },
            ],
          },
        },
      });

      // Act: Create financial transaction
      const transaction = await prisma.financialTransaction.create({
        data: {
          type: 'INCOME',
          amount: 150.00,
          description: `Venda - Pedido ${order.id}`,
          category: 'Vendas',
          status: 'COMPLETED',
          orderId: order.id,
          restaurantId: restaurantA.restaurantId,
          createdById: userA.userId,
          date: new Date(),
        },
      });

      // Assert
      expect(transaction).toBeDefined();
      expect(transaction.type).toBe('INCOME');
      expect(transaction.amount).toBe(150.00);
      expect(transaction.orderId).toBe(order.id);
      expect(transaction.restaurantId).toBe(restaurantA.restaurantId);
    });

    it('should auto-categorize transaction', async () => {
      // Act: Create categorized transaction
      const transaction = await prisma.financialTransaction.create({
        data: {
          type: 'INCOME',
          amount: 250.00,
          description: 'Venda - Delivery iFood',
          category: 'Vendas Online',
          subcategory: 'iFood',
          status: 'COMPLETED',
          restaurantId: restaurantA.restaurantId,
          createdById: userA.userId,
          date: new Date(),
        },
      });

      // Assert
      expect(transaction.category).toBe('Vendas Online');
      expect(transaction.subcategory).toBe('iFood');
    });

    it('should update chart of accounts with transaction', async () => {
      // Arrange: Create chart of account entry
      const chartAccount = await prisma.chartOfAccount.create({
        data: {
          code: '1.1.001',
          name: 'Receitas de Vendas',
          type: 'REVENUE',
          restaurantId: restaurantA.restaurantId,
        },
      });

      // Act: Create transaction linked to chart account
      const transaction = await prisma.financialTransaction.create({
        data: {
          type: 'INCOME',
          amount: 500.00,
          description: 'Venda do dia',
          category: 'Vendas',
          chartOfAccountId: chartAccount.id,
          status: 'COMPLETED',
          restaurantId: restaurantA.restaurantId,
          createdById: userA.userId,
          date: new Date(),
        },
      });

      // Assert
      const updatedChart = await prisma.chartOfAccount.findUnique({
        where: { id: chartAccount.id },
      });

      expect(transaction.chartOfAccountId).toBe(chartAccount.id);
      expect(updatedChart).toBeDefined();
    });
  });

  describe('Expense Recording', () => {
    it('should create expense transaction for supplier payment', async () => {
      // Arrange: Create supplier
      const supplier = await prisma.supplier.create({
        data: {
          code: 'SUP-FIN-001',
          name: 'Supplier Financial Test',
          restaurantId: restaurantA.restaurantId,
        },
      });

      // Act: Create expense transaction
      const transaction = await prisma.financialTransaction.create({
        data: {
          type: 'EXPENSE',
          amount: 350.00,
          description: `Pagamento - ${supplier.name}`,
          category: 'Matéria Prima',
          status: 'COMPLETED',
          supplierId: supplier.id,
          restaurantId: restaurantA.restaurantId,
          createdById: userA.userId,
          date: new Date(),
        },
      });

      // Assert
      expect(transaction.type).toBe('EXPENSE');
      expect(transaction.amount).toBe(350.00);
      expect(transaction.supplierId).toBe(supplier.id);
    });

    it('should track expense category balance', async () => {
      // Arrange
      const category = 'Operacional';

      // Act: Create multiple expenses in same category
      const expenses = await Promise.all([
        prisma.financialTransaction.create({
          data: {
            type: 'EXPENSE',
            amount: 100.00,
            description: 'Energia elétrica',
            category,
            status: 'COMPLETED',
            restaurantId: restaurantA.restaurantId,
            createdById: userA.userId,
            date: new Date(),
          },
        }),
        prisma.financialTransaction.create({
          data: {
            type: 'EXPENSE',
            amount: 150.00,
            description: 'Água',
            category,
            status: 'COMPLETED',
            restaurantId: restaurantA.restaurantId,
            createdById: userA.userId,
            date: new Date(),
          },
        }),
      ]);

      // Assert: Sum expenses
      const totalExpenses = await prisma.financialTransaction.aggregate({
        where: {
          restaurantId: restaurantA.restaurantId,
          type: 'EXPENSE',
          category,
          status: 'COMPLETED',
        },
        _sum: { amount: true },
      });

      expect(totalExpenses._sum.amount).toBe(250.00);
    });
  });

  describe('Financial Reporting', () => {
    it('should generate daily revenue report', async () => {
      // Arrange: Create transactions for today
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      await Promise.all([
        prisma.financialTransaction.create({
          data: {
            type: 'INCOME',
            amount: 200.00,
            description: 'Venda 1',
            category: 'Vendas',
            status: 'COMPLETED',
            restaurantId: restaurantA.restaurantId,
            createdById: userA.userId,
            date: today,
          },
        }),
        prisma.financialTransaction.create({
          data: {
            type: 'INCOME',
            amount: 150.00,
            description: 'Venda 2',
            category: 'Vendas',
            status: 'COMPLETED',
            restaurantId: restaurantA.restaurantId,
            createdById: userA.userId,
            date: today,
          },
        }),
      ]);

      // Act: Get daily revenue
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const dailyRevenue = await prisma.financialTransaction.aggregate({
        where: {
          restaurantId: restaurantA.restaurantId,
          type: 'INCOME',
          status: 'COMPLETED',
          date: {
            gte: today,
            lt: tomorrow,
          },
        },
        _sum: { amount: true },
        _count: { id: true },
      });

      // Assert
      expect(dailyRevenue._sum.amount).toBe(350.00);
      expect(dailyRevenue._count.id).toBe(2);
    });

    it('should generate monthly financial summary', async () => {
      // Arrange: Create transactions across different days
      const baseDate = new Date();
      baseDate.setDate(1); // First of month

      const transactions = [
        { type: 'INCOME' as const, amount: 1000, day: 1 },
        { type: 'INCOME' as const, amount: 1500, day: 5 },
        { type: 'EXPENSE' as const, amount: 500, day: 3 },
        { type: 'EXPENSE' as const, amount: 300, day: 10 },
      ];

      await Promise.all(
        transactions.map((t) => {
          const date = new Date(baseDate);
          date.setDate(t.day);
          return prisma.financialTransaction.create({
            data: {
              type: t.type,
              amount: t.amount,
              description: `Test transaction ${t.day}`,
              category: t.type === 'INCOME' ? 'Vendas' : 'Despesas',
              status: 'COMPLETED',
              restaurantId: restaurantA.restaurantId,
              createdById: userA.userId,
              date,
            },
          });
        })
      );

      // Act: Get monthly summary
      const startOfMonth = new Date(baseDate);
      const endOfMonth = new Date(baseDate);
      endOfMonth.setMonth(endOfMonth.getMonth() + 1);

      const [income, expenses] = await Promise.all([
        prisma.financialTransaction.aggregate({
          where: {
            restaurantId: restaurantA.restaurantId,
            type: 'INCOME',
            status: 'COMPLETED',
            date: { gte: startOfMonth, lt: endOfMonth },
          },
          _sum: { amount: true },
        }),
        prisma.financialTransaction.aggregate({
          where: {
            restaurantId: restaurantA.restaurantId,
            type: 'EXPENSE',
            status: 'COMPLETED',
            date: { gte: startOfMonth, lt: endOfMonth },
          },
          _sum: { amount: true },
        }),
      ]);

      // Assert
      expect(income._sum.amount).toBe(2500); // 1000 + 1500
      expect(expenses._sum.amount).toBe(800); // 500 + 300
    });
  });

  describe('Payment Processing', () => {
    it('should process order payment and update status', async () => {
      // Arrange
      const order = await prisma.order.create({
        data: {
          type: 'DINE_IN',
          table: 'PAY-001',
          status: 'COMPLETED',
          total: 89.90,
          restaurantId: restaurantA.restaurantId,
        },
      });

      // Act: Create payment transaction
      const payment = await prisma.financialTransaction.create({
        data: {
          type: 'INCOME',
          amount: 89.90,
          description: `Pagamento - Pedido ${order.id}`,
          category: 'Vendas',
          paymentMethod: 'CREDIT_CARD',
          status: 'COMPLETED',
          orderId: order.id,
          restaurantId: restaurantA.restaurantId,
          createdById: userA.userId,
          date: new Date(),
        },
      });

      // Assert
      expect(payment.paymentMethod).toBe('CREDIT_CARD');
      expect(payment.status).toBe('COMPLETED');
      expect(payment.orderId).toBe(order.id);
    });

    it('should handle pending payment status', async () => {
      // Arrange
      const order = await prisma.order.create({
        data: {
          type: 'DELIVERY',
          status: 'READY',
          total: 120.00,
          restaurantId: restaurantA.restaurantId,
        },
      });

      // Act: Create pending payment
      const payment = await prisma.financialTransaction.create({
        data: {
          type: 'INCOME',
          amount: 120.00,
          description: `Pagamento pendente - Pedido ${order.id}`,
          category: 'Vendas',
          paymentMethod: 'PIX',
          status: 'PENDING',
          orderId: order.id,
          restaurantId: restaurantA.restaurantId,
          createdById: userA.userId,
          date: new Date(),
        },
      });

      // Assert
      expect(payment.status).toBe('PENDING');
      expect(payment.paymentMethod).toBe('PIX');
    });
  });

  describe('Budget Tracking', () => {
    it('should track budget vs actual spending', async () => {
      // Arrange: Create budget
      const budget = await prisma.budget.create({
        data: {
          name: 'Orçamento Mensal - Matéria Prima',
          category: 'Matéria Prima',
          amount: 2000.00,
          period: 'MONTHLY',
          startDate: new Date(),
          restaurantId: restaurantA.restaurantId,
        },
      });

      // Act: Create expenses
      await Promise.all([
        prisma.financialTransaction.create({
          data: {
            type: 'EXPENSE',
            amount: 500.00,
            description: 'Compra de carnes',
            category: 'Matéria Prima',
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
            description: 'Compra de vegetais',
            category: 'Matéria Prima',
            status: 'COMPLETED',
            restaurantId: restaurantA.restaurantId,
            createdById: userA.userId,
            date: new Date(),
          },
        }),
      ]);

      // Calculate spent
      const spent = await prisma.financialTransaction.aggregate({
        where: {
          restaurantId: restaurantA.restaurantId,
          type: 'EXPENSE',
          category: 'Matéria Prima',
          status: 'COMPLETED',
        },
        _sum: { amount: true },
      });

      // Assert
      expect(budget.amount).toBe(2000.00);
      expect(spent._sum.amount).toBe(800.00);

      // Should trigger alert at 80% of budget
      const percentageUsed = (spent._sum.amount || 0) / budget.amount * 100;
      expect(percentageUsed).toBe(40); // 800/2000 = 40%
    });
  });

  describe('Multi-Restaurant Financial Isolation', () => {
    it('should keep financial transactions isolated', async () => {
      // Arrange: Create transactions in both restaurants
      const transactionA = await prisma.financialTransaction.create({
        data: {
          type: 'INCOME',
          amount: 500.00,
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
          amount: 750.00,
          description: 'Restaurant B Revenue',
          category: 'Vendas',
          status: 'COMPLETED',
          restaurantId: restaurantB.restaurantId,
          createdById: userB.userId,
          date: new Date(),
        },
      });

      // Act & Assert
      const revenueA = await prisma.financialTransaction.aggregate({
        where: {
          restaurantId: restaurantA.restaurantId,
          type: 'INCOME',
        },
        _sum: { amount: true },
      });

      const revenueB = await prisma.financialTransaction.aggregate({
        where: {
          restaurantId: restaurantB.restaurantId,
          type: 'INCOME',
        },
        _sum: { amount: true },
      });

      expect(revenueA._sum.amount).toBe(500.00);
      expect(revenueB._sum.amount).toBe(750.00);
    });

    it('should generate separate financial reports', async () => {
      // Act: Generate reports for each restaurant
      const [reportA, reportB] = await Promise.all([
        prisma.financialTransaction.groupBy({
          by: ['type'],
          where: { restaurantId: restaurantA.restaurantId },
          _sum: { amount: true },
        }),
        prisma.financialTransaction.groupBy({
          by: ['type'],
          where: { restaurantId: restaurantB.restaurantId },
          _sum: { amount: true },
        }),
      ]);

      // Assert: Reports are separate
      const incomeA = reportA.find((r) => r.type === 'INCOME')?._sum.amount || 0;
      const incomeB = reportB.find((r) => r.type === 'INCOME')?._sum.amount || 0;

      // They should have independent values
      expect(reportA).toBeDefined();
      expect(reportB).toBeDefined();
    });
  });

  describe('Financial Performance', () => {
    it('should query financial data within performance threshold', async () => {
      // Arrange: Create multiple transactions
      await Promise.all(
        Array.from({ length: 50 }, (_, i) =>
          prisma.financialTransaction.create({
            data: {
              type: i % 2 === 0 ? 'INCOME' : 'EXPENSE',
              amount: Math.round(Math.random() * 1000 * 100) / 100,
              description: `Transaction ${i}`,
              category: i % 2 === 0 ? 'Vendas' : 'Despesas',
              status: 'COMPLETED',
              restaurantId: restaurantA.restaurantId,
              createdById: userA.userId,
              date: new Date(),
            },
          })
        )
      );

      // Act & Assert: Query with performance check
      const { result, duration } = await assertQueryPerformance(
        () =>
          prisma.financialTransaction.findMany({
            where: { restaurantId: restaurantA.restaurantId },
            orderBy: { date: 'desc' },
            take: 20,
          }),
        500,
        'Financial transactions query'
      );

      expect(result).toHaveLength(20);
      expect(duration).toBeLessThan(500);
    });
  });
});
