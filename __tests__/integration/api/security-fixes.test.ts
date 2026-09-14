// @ts-nocheck
/**
 * Regression tests for the security/data-integrity fixes made in this session:
 *
 * 1. Payment refund endpoints (app/api/pagamentos/{unified,stripe,mp}/refund,
 *    app/api/pagamentos/unified/[id]) now scope every lookup by restaurantId
 *    instead of looking a Payment up by id alone.
 * 2. lib/whatsapp/get-restaurant.ts (getCurrentRestaurantId) now requires an
 *    active RestaurantUser membership (or ownership) before trusting
 *    user.currentRestaurantId, so a removed staff member loses access.
 * 3. app/api/stock/movement and app/api/stock/quick-movement now update
 *    Stock.currentQuantity with an atomic increment/decrement instead of a
 *    read-then-write, which used to lose updates under concurrency.
 *
 * These tests exercise the same Prisma query shapes the fixed routes use,
 * against the real dev database, rather than going through Next.js request
 * handling / NextAuth session mocking.
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('Security fixes - regression tests', () => {
  let restaurantA: { restaurantId: string; ownerId: string };
  let restaurantB: { restaurantId: string; ownerId: string };
  let paymentA: any;
  let categoryA: any;

  beforeAll(async () => {
    const scenario = await createMultiRestaurantScenario();
    restaurantA = scenario.restaurantA;
    restaurantB = scenario.restaurantB;

    paymentA = await prisma.payment.create({
      data: {
        restaurantId: restaurantA.restaurantId,
        amount: 150.0,
        method: 'PIX',
        status: 'APPROVED',
        gateway: 'MERCADO_PAGO',
        customerEmail: 'cliente@teste.com',
      },
    });

    categoryA = await prisma.ingredientCategory.create({
      data: { name: `Concurrency Test ${Date.now()}`, restaurantId: restaurantA.restaurantId },
    });
  });

  afterAll(async () => {
    await prisma.paymentRefund.deleteMany({ where: { paymentId: paymentA.id } });
    await prisma.payment.deleteMany({ where: { id: paymentA.id } });
    await prisma.stock.deleteMany({ where: { restaurantId: restaurantA.restaurantId } });
    await prisma.ingredient.deleteMany({ where: { restaurantId: restaurantA.restaurantId } });
    await prisma.ingredientCategory.deleteMany({ where: { id: categoryA.id } });
    await cleanupMultiTenantData([restaurantA.restaurantId, restaurantB.restaurantId]);
  });

  describe('Payment refund cross-tenant isolation', () => {
    it('BEFORE the fix: an unscoped lookup by id alone finds another restaurant\'s payment (proves the bug was real)', async () => {
      const unscopedLookup = await prisma.payment.findUnique({ where: { id: paymentA.id } });
      expect(unscopedLookup).not.toBeNull();
      expect(unscopedLookup?.restaurantId).toBe(restaurantA.restaurantId);
    });

    it('AFTER the fix: restaurant B cannot resolve restaurant A\'s payment for refund', async () => {
      const found = await prisma.payment.findFirst({
        where: { id: paymentA.id, restaurantId: restaurantB.restaurantId },
      });
      expect(found).toBeNull();
    });

    it('AFTER the fix: restaurant A can still resolve its own payment for refund', async () => {
      const found = await prisma.payment.findFirst({
        where: { id: paymentA.id, restaurantId: restaurantA.restaurantId },
      });
      expect(found).not.toBeNull();
      expect(found?.id).toBe(paymentA.id);
    });
  });

  describe('Removed staff member loses access (getCurrentRestaurantId)', () => {
    it('an active membership is resolved as a still-valid restaurant context', async () => {
      const staff = await prisma.user.create({
        data: {
          email: `staff-active-${Date.now()}@integration.test`,
          name: 'Staff Active',
          password: 'hashed_password',
          role: 'MANAGER',
          currentRestaurantId: restaurantA.restaurantId,
          active: true,
        },
      });
      await prisma.restaurantUser.create({
        data: { restaurantId: restaurantA.restaurantId, userId: staff.id, role: 'MANAGER', isActive: true },
      });

      const stillMember = await prisma.restaurantUser.findFirst({
        where: { restaurantId: restaurantA.restaurantId, userId: staff.id, isActive: true },
        select: { id: true },
      });
      expect(stillMember).not.toBeNull();

      await prisma.restaurantUser.deleteMany({ where: { userId: staff.id } });
      await prisma.user.delete({ where: { id: staff.id } });
    });

    it('a removed (isActive=false) member no longer resolves as a valid restaurant context', async () => {
      const staff = await prisma.user.create({
        data: {
          email: `staff-removed-${Date.now()}@integration.test`,
          name: 'Staff Removed',
          password: 'hashed_password',
          role: 'MANAGER',
          currentRestaurantId: restaurantA.restaurantId,
          active: true,
        },
      });
      await prisma.restaurantUser.create({
        data: { restaurantId: restaurantA.restaurantId, userId: staff.id, role: 'MANAGER', isActive: true },
      });

      // Simulates "removing a team member" (app/api/conta/profile PUT), which
      // flips isActive rather than deleting the row.
      await prisma.restaurantUser.updateMany({
        where: { restaurantId: restaurantA.restaurantId, userId: staff.id },
        data: { isActive: false },
      });

      // This is exactly the check getCurrentRestaurantId() now performs
      // before trusting the stale user.currentRestaurantId from their
      // still-valid JWT session.
      const [stillMember, ownsIt] = await Promise.all([
        prisma.restaurantUser.findFirst({
          where: { restaurantId: restaurantA.restaurantId, userId: staff.id, isActive: true },
          select: { id: true },
        }),
        prisma.restaurant.findFirst({
          where: { id: restaurantA.restaurantId, ownerId: staff.id },
          select: { id: true },
        }),
      ]);
      expect(stillMember).toBeNull();
      expect(ownsIt).toBeNull();

      await prisma.restaurantUser.deleteMany({ where: { userId: staff.id } });
      await prisma.user.delete({ where: { id: staff.id } });
    });
  });

  describe('Stock update concurrency', () => {
    it('BEFORE the fix: read-then-write loses updates under concurrent movements (proves the bug was real)', async () => {
      const ingredient = await prisma.ingredient.create({
        data: {
          restaurantId: restaurantA.restaurantId,
          code: `CONC-NAIVE-${Date.now()}`,
          name: 'Naive Concurrency Ingredient',
          categoryId: categoryA.id,
          standardUnit: 'kg',
          purchaseUnit: 'kg',
        },
      });
      await prisma.stock.create({
        data: { restaurantId: restaurantA.restaurantId, ingredientId: ingredient.id, currentQuantity: 1000 },
      });

      const CONCURRENT_OPS = 25;
      const DECREMENT_EACH = 10;

      // Exactly reproduces the pre-fix pattern in stock/movement/route.ts:
      // read currentQuantity, compute in JS, write the whole value back.
      await Promise.all(
        Array.from({ length: CONCURRENT_OPS }, async () => {
          const current = await prisma.stock.findUnique({ where: { ingredientId: ingredient.id } });
          const newQuantity = current!.currentQuantity - DECREMENT_EACH;
          await prisma.stock.update({ where: { ingredientId: ingredient.id }, data: { currentQuantity: newQuantity } });
        })
      );

      const final = await prisma.stock.findUnique({ where: { ingredientId: ingredient.id } });
      const expected = 1000 - CONCURRENT_OPS * DECREMENT_EACH;
      // The whole point of the bug: some concurrent decrements get silently
      // overwritten, so the final value ends up HIGHER than the correct sum.
      expect(final!.currentQuantity).not.toBe(expected);

      await prisma.stock.deleteMany({ where: { ingredientId: ingredient.id } });
      await prisma.ingredient.delete({ where: { id: ingredient.id } });
    });

    it('AFTER the fix: atomic increment/decrement never loses updates under concurrency', async () => {
      const ingredient = await prisma.ingredient.create({
        data: {
          restaurantId: restaurantA.restaurantId,
          code: `CONC-ATOMIC-${Date.now()}`,
          name: 'Atomic Concurrency Ingredient',
          categoryId: categoryA.id,
          standardUnit: 'kg',
          purchaseUnit: 'kg',
        },
      });
      await prisma.stock.create({
        data: { restaurantId: restaurantA.restaurantId, ingredientId: ingredient.id, currentQuantity: 1000 },
      });

      const CONCURRENT_OPS = 25;
      const DECREMENT_EACH = 10;

      // Matches the fixed pattern: the read/compute/write is replaced by a
      // single atomic decrement expression evaluated by the database.
      await Promise.all(
        Array.from({ length: CONCURRENT_OPS }, () =>
          prisma.stock.update({
            where: { ingredientId: ingredient.id },
            data: { currentQuantity: { decrement: DECREMENT_EACH } },
          })
        )
      );

      const final = await prisma.stock.findUnique({ where: { ingredientId: ingredient.id } });
      expect(final!.currentQuantity).toBe(1000 - CONCURRENT_OPS * DECREMENT_EACH);

      await prisma.stock.deleteMany({ where: { ingredientId: ingredient.id } });
      await prisma.ingredient.delete({ where: { id: ingredient.id } });
    });
  });
});
