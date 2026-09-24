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
 *   P1 records  K1   the ADJUSTMENT movement stores |difference|: a surplus of 3 and a shortage of 3
 *                    are the same movement (the sign is only in the free-text reason)
 *   P1 records  K2   no author: StockMovement has no user and no audit log is written
 *   P1 stock    K3   the count OVERWRITES stock with the counted number: a sale made between the
 *                    count and the save is erased (its deduction is lost)
 *   P1 input    K4   a negative or empty count is accepted (stock becomes negative / zero)
 *   P1 money    K7   the CMV ignores every ADJUSTMENT: a shortage found by the count never costs anything
 *   P2 alert    K6   a big difference raises no alert
 *   also seen   /api/stock/quick-movement treats "ADJUSTMENT" as a deduction (always down), the
 *               opposite convention of the count; a count is not atomic (per-item writes)
 */
import crypto from 'crypto';
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

  const count = (counts: any[]) =>
    saveCount(new Request('http://localhost/api/stock-count', { method: 'POST', body: JSON.stringify({ counts }) }) as any);
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
    it.failing('a shortage and a surplus are told apart by the movement itself', async () => {
      await count([{ ingredientId: flour.id, countedQuantity: 7, systemQuantity: 10 }]);
      await setStock(flourB.id, 10);
      asOwnerB();
      await count([{ ingredientId: flourB.id, countedQuantity: 13, systemQuantity: 10 }]);

      const [shortage] = await movementsOf(flour.id);
      const [surplus] = await movementsOf(flourB.id);
      expect(shortage.quantity).toBe(-3);
      expect(surplus.quantity).toBe(3);
    });

    it.failing('the count records who counted', async () => {
      await count([{ ingredientId: flour.id, countedQuantity: 7, systemQuantity: 10 }]);

      const logs = await prisma.auditLog.findMany({ where: { userId: A.ownerId } });
      expect(logs.length).toBeGreaterThan(0);
    });
  });

  describe('K3: sales between the count and the save are kept', () => {
    it.failing('counted 7 when the screen showed 10, a sale of 2 happened before saving: stock ends at 5', async () => {
      // the operator loaded the screen (system 10) and counted 7; meanwhile a sale deducted 2
      await setStock(flour.id, 8);

      await count([{ ingredientId: flour.id, countedQuantity: 7, systemQuantity: 10 }]);

      expect(await stockOf(flour.id)).toBe(5);
    });
  });

  describe('K4: an impossible count is refused', () => {
    it.failing('a negative count is refused and nothing changes', async () => {
      const res = await count([{ ingredientId: flour.id, countedQuantity: -4, systemQuantity: 10 }]);

      expect(res.status).toBe(400);
      expect(await stockOf(flour.id)).toBe(10);
      expect(await movementsOf(flour.id)).toHaveLength(0);
    });

    it.failing('an empty count (null) is refused and nothing changes', async () => {
      const res = await count([{ ingredientId: flour.id, countedQuantity: null, systemQuantity: 10 }]);

      expect(res.status).toBe(400);
      expect(await stockOf(flour.id)).toBe(10);
    });
  });

  describe('K6 / K7: the manager sees the difference', () => {
    it.failing('a big shortage raises an alert', async () => {
      await count([{ ingredientId: flour.id, countedQuantity: 4, systemQuantity: 10 }]);

      expect(await prisma.notification.count({ where: { restaurantId: A.restaurantId } })).toBeGreaterThan(0);
    });

    it.failing('the shortage found by the count shows up in the CMV', async () => {
      const before = await (await readCmv(new Request('http://localhost/api/cmv?period=30') as any)).json();

      await count([{ ingredientId: flour.id, countedQuantity: 7, systemQuantity: 10 }]);

      const after = await (await readCmv(new Request('http://localhost/api/cmv?period=30') as any)).json();
      expect(after.cmv - before.cmv).toBeCloseTo(3 * COST);
    });
  });

  it.todo('a count adjustment can be reversed, leaving both movements in the history');
});
