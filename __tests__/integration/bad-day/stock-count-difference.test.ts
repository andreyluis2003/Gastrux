// @ts-nocheck
/**
 * "Bad day" scenario 8 (docs/superpowers/plans/2026-09-20-bad-day-scenarios-test-plan.md):
 * the physical stock count does not match the system (surplus or shortage).
 * Each case states the DESIRED behaviour (market practice for inventory counts): the adjustment is
 * a movement that says which way it went, who counted and why; sales made between the count and
 * the save are not erased; an impossible count is refused; a big difference raises an alert; the
 * shortage found by the count shows up in the CMV ("perda não identificada") without rewriting
 * history; and one restaurant can never adjust another's stock.
 * A case that documents a known gap is written with `it.failing` (the suite stays green and a case
 * flips to a failure the day its gap is fixed). Gaps, by priority:
 *   (all fixed 2026-09-24 in lib/stock/stock-count.ts, the CMV routes and migration
 *   20260924130000_signed_stock_adjustments:)
 *   K1  ADJUSTMENT quantities are signed (+ surplus / - shortage) everywhere; they used to store
 *       |difference| (count) or always mean "out" (quick-movement, /api/stock/movement)
 *   K2  the count writes an audit log with who counted
 *   K3  the difference is measured against what the screen showed (systemQuantity + countId) and
 *       applied as a delta: a sale between the count and the save is kept (it used to be erased)
 *   K4  a negative / empty count is refused (400) and the whole count is all or nothing
 *   K6  a difference of R$ 50 or 10% of the system quantity raises a notification
 *   K7  the CMV counts count shortages as "perdas não identificadas" (unidentifiedLosses)
 *   still open: reversing a count adjustment (it.todo); /api/stock/movement had no tenant check
 *   before writing the movement (fixed with K1)
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/whatsapp/get-restaurant', () => ({ getCurrentRestaurantId: jest.fn() }));
jest.mock('../../../lib/api/restaurant-context', () => ({ getRestaurantContext: jest.fn() }));

import { getServerSession } from 'next-auth';
import { getCurrentRestaurantId } from '../../../lib/whatsapp/get-restaurant';
import { getRestaurantContext } from '../../../lib/api/restaurant-context';
import { POST as saveCount } from '../../../app/api/stock-count/route';
import { GET as readCmv } from '../../../app/api/cmv/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('bad day 8: stock counted with a difference', () => {
  let A: { restaurantId: string; ownerId: string };
  let B: { restaurantId: string; ownerId: string };
  let flour: any;
  let flourB: any;
  const tag = crypto.randomBytes(3).toString('hex');
  const COST = 10; // referenceCost per kg

  const asUser = (userId: string, restaurantId: string, role = 'OWNER') => {
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: userId, email: `${userId}@x.test`, role } });
    (getCurrentRestaurantId as jest.Mock).mockResolvedValue(restaurantId);
    (getRestaurantContext as jest.Mock).mockResolvedValue({ userId, restaurantId, role });
  };
  const asOwnerA = () => asUser(A.ownerId, A.restaurantId);
  const asOwnerB = () => asUser(B.ownerId, B.restaurantId);

  const count = (counts: any[], countId?: string) =>
    saveCount(new Request('http://localhost/api/stock-count', { method: 'POST', body: JSON.stringify({ counts, countId }) }) as any);
  const stockOf = async (ingredientId: string) =>
    (await prisma.stock.findUnique({ where: { ingredientId } })).currentQuantity;
  const movementsOf = (ingredientId: string) =>
    prisma.stockMovement.findMany({ where: { ingredientId }, orderBy: { createdAt: 'asc' } });
  const setStock = (ingredientId: string, q: number) =>
    prisma.stock.update({ where: { ingredientId }, data: { currentQuantity: q } });

  const mkIngredient = async (restaurantId: string, name: string) => {
    const category = await prisma.ingredientCategory.create({ data: { restaurantId, name: `Cat ${name} ${tag}` } });
    const ing = await prisma.ingredient.create({
      data: {
        restaurantId, code: `I-${crypto.randomBytes(3).toString('hex')}`, name: `${name} ${tag}`, categoryId: category.id,
        standardUnit: 'kg', purchaseUnit: 'kg', referenceCost: COST,
      },
    });
    await prisma.stock.create({ data: { restaurantId, ingredientId: ing.id, currentQuantity: 10 } });
    return ing;
  };

  const wipe = async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.stockMovement.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { OR: [{ restaurantId: { in: ids } }, { userId: { in: [A.ownerId, B.ownerId] } }] } });
    await prisma.notification.deleteMany({ where: { restaurantId: { in: ids } } });
    await setStock(flour.id, 10);
    await setStock(flourB.id, 10);
  };

  beforeAll(async () => {
    const scenario = await createMultiRestaurantScenario();
    A = scenario.restaurantA;
    B = scenario.restaurantB;
    flour = await mkIngredient(A.restaurantId, 'Farinha');
    flourB = await mkIngredient(B.restaurantId, 'Farinha B');
  });

  afterAll(async () => {
    await wipe();
    await cleanupMultiTenantData([A.restaurantId, B.restaurantId]);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await wipe();
    asOwnerA();
  });

  describe('what already works', () => {
    it('a shortage sets the stock to the counted quantity and keeps a movement with before / after', async () => {
      const res = await count([{ ingredientId: flour.id, countedQuantity: 7, systemQuantity: 10 }]);

      expect(res.status).toBe(200);
      expect(await stockOf(flour.id)).toBe(7);
      const [m] = await movementsOf(flour.id);
      expect(m.movementType).toBe('ADJUSTMENT');
      expect(m.reason).toMatch(/10 → 7/);
    });

    it('a count equal to the system creates no movement', async () => {
      await count([{ ingredientId: flour.id, countedQuantity: 10, systemQuantity: 10 }]);
      expect(await movementsOf(flour.id)).toHaveLength(0);
    });

    it('saving the same count twice adjusts once', async () => {
      await count([{ ingredientId: flour.id, countedQuantity: 7, systemQuantity: 10 }]);
      await count([{ ingredientId: flour.id, countedQuantity: 7, systemQuantity: 10 }]);
      expect(await movementsOf(flour.id)).toHaveLength(1);
      expect(await stockOf(flour.id)).toBe(7);
    });

    it("another restaurant's ingredient is ignored", async () => {
      asOwnerB();
      await count([{ ingredientId: flour.id, countedQuantity: 0, systemQuantity: 10 }]);
      expect(await stockOf(flour.id)).toBe(10);
      expect(await movementsOf(flour.id)).toHaveLength(0);
    });
  });

  describe('K1 / K2: the adjustment says which way and who', () => {
    it('a shortage and a surplus are told apart by the movement itself', async () => {
      await count([{ ingredientId: flour.id, countedQuantity: 7, systemQuantity: 10 }]);
      await setStock(flourB.id, 10);
      asOwnerB();
      await count([{ ingredientId: flourB.id, countedQuantity: 13, systemQuantity: 10 }]);

      const [shortage] = await movementsOf(flour.id);
      const [surplus] = await movementsOf(flourB.id);
      expect(shortage.quantity).toBe(-3);
      expect(surplus.quantity).toBe(3);
    });

    it('the count records who counted', async () => {
      await count([{ ingredientId: flour.id, countedQuantity: 7, systemQuantity: 10 }]);

      const logs = await prisma.auditLog.findMany({ where: { userId: A.ownerId } });
      expect(logs.length).toBeGreaterThan(0);
    });
  });

  describe('K3: sales between the count and the save are kept', () => {
    it('counted 7 when the screen showed 10, a sale of 2 happened before saving: stock ends at 5', async () => {
      // the operator loaded the screen (system 10) and counted 7; meanwhile a sale deducted 2
      await setStock(flour.id, 8);

      await count([{ ingredientId: flour.id, countedQuantity: 7, systemQuantity: 10 }], 'count-k3');

      expect(await stockOf(flour.id)).toBe(5);
      const [m] = await movementsOf(flour.id);
      expect(m.quantity).toBe(-3);
      expect(m.reason).toMatch(/preservados/);
    });
  });

  describe('K4: an impossible count is refused', () => {
    it('a negative count is refused and nothing changes', async () => {
      const res = await count([{ ingredientId: flour.id, countedQuantity: -4, systemQuantity: 10 }]);

      expect(res.status).toBe(400);
      expect(await stockOf(flour.id)).toBe(10);
      expect(await movementsOf(flour.id)).toHaveLength(0);
    });

    it('an empty count (null) is refused and nothing changes', async () => {
      const res = await count([{ ingredientId: flour.id, countedQuantity: null, systemQuantity: 10 }]);

      expect(res.status).toBe(400);
      expect(await stockOf(flour.id)).toBe(10);
    });
  });

  describe('K6 / K7: the manager sees the difference', () => {
    it('a big shortage raises an alert', async () => {
      await count([{ ingredientId: flour.id, countedQuantity: 4, systemQuantity: 10 }]);

      expect(await prisma.notification.count({ where: { restaurantId: A.restaurantId } })).toBeGreaterThan(0);
    });

    it('the shortage found by the count shows up in the CMV', async () => {
      const before = await (await readCmv(new Request('http://localhost/api/cmv?period=30') as any)).json();

      await count([{ ingredientId: flour.id, countedQuantity: 7, systemQuantity: 10 }]);

      const after = await (await readCmv(new Request('http://localhost/api/cmv?period=30') as any)).json();
      expect(after.cmv - before.cmv).toBeCloseTo(3 * COST);
    });
  });

  describe('the same count saved twice / partially invalid', () => {
    it('the same count id saved twice applies once, even after a sale in between', async () => {
      await count([{ ingredientId: flour.id, countedQuantity: 7, systemQuantity: 10 }], 'count-twice');
      await setStock(flour.id, 6); // a sale of 1 after the first save

      await count([{ ingredientId: flour.id, countedQuantity: 7, systemQuantity: 10 }], 'count-twice');

      expect(await movementsOf(flour.id)).toHaveLength(1);
      expect(await stockOf(flour.id)).toBe(6);
    });

    it('one invalid line refuses the whole count: nothing is written', async () => {
      const res = await count([
        { ingredientId: flour.id, countedQuantity: 7, systemQuantity: 10 },
        { ingredientId: flour.id, countedQuantity: 'abc', systemQuantity: 10 },
      ], 'count-bad');

      expect(res.status).toBe(400);
      expect(await stockOf(flour.id)).toBe(10);
      expect(await movementsOf(flour.id)).toHaveLength(0);
    });

    it('a small difference (under R$ 50 and 10%) raises no alert', async () => {
      await setStock(flour.id, 100);
      await count([{ ingredientId: flour.id, countedQuantity: 99, systemQuantity: 100 }], 'count-small');

      expect(await prisma.notification.count({ where: { restaurantId: A.restaurantId } })).toBe(0);
    });
  });

  describe('legacy adjustments (migration 20260924130000)', () => {
    it('old positive adjustments become stock-outs, except count surpluses', async () => {
      const mk = (quantity: number, reason: string | null, referenceType: string | null = null) =>
        prisma.stockMovement.create({ data: { restaurantId: A.restaurantId, ingredientId: flour.id, quantity, movementType: 'ADJUSTMENT', reason, referenceType } });
      const shortage = await mk(3, 'Contagem física: 10 → 7 (dif: -3.00)');
      const surplus = await mk(2, 'Contagem física: 10 → 12 (dif: +2.00)');
      const quick = await mk(4, 'Inventário rápido: ADJUSTMENT', 'QUICK_INVENTORY');
      const manual = await mk(1, null);
      const alreadySigned = await mk(-5, 'Contagem física: 10 → 5 (dif: -5.00)', 'STOCK_COUNT');

      const sql = fs.readFileSync(
        path.join(__dirname, '../../../prisma/migrations/20260924130000_signed_stock_adjustments/migration.sql'),
        'utf8'
      );
      await prisma.$executeRawUnsafe(sql.replace(/--.*$/gm, ''));

      const q = async (m: any) => (await prisma.stockMovement.findUnique({ where: { id: m.id } })).quantity;
      expect(await q(shortage)).toBe(-3);
      expect(await q(surplus)).toBe(2);
      expect(await q(quick)).toBe(-4);
      expect(await q(manual)).toBe(-1);
      expect(await q(alreadySigned)).toBe(-5);
    });
  });

  it.todo('a count adjustment can be reversed, leaving both movements in the history');
});
