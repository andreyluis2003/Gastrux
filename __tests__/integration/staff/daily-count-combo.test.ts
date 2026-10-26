// @ts-nocheck
/** "Na contagem do dia, conta como" (spec 2026-10-26 lanchonete): a combo sold counts its counted parts */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { GET as BOARD } from '../../../app/api/daily-count/route';
import { GET as RECIPE, PUT } from '../../../app/api/recipes/[id]/route';
import { recordKitchenCountLoss } from '../../../lib/daily-count/service';
import { seedStarterTemplate } from '../../../lib/onboarding/seed-template';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const as = (u) => {
  const s = { user: u, expires: '2099-01-01' };
  (getServerSession as jest.Mock).mockResolvedValue(s);
  (getServerSessionNext as jest.Mock).mockResolvedValue(s);
};
let seq = 0;
const base = (name) => ({ name, baseYield: 1, yieldUnit: 'un', portionSize: 1, portionUnit: 'un', prepTimeMinutes: 0, yieldLossFactor: 0 });
const put = (id, body) => PUT(new NextRequest('http://x', { method: 'PUT', body: JSON.stringify(body) }), { params: { id } });
const sold = async (recipeId) => (await (await BOARD(new NextRequest('http://x'))).json()).rows.find((r) => r.recipeId === recipeId)?.sold;

describe('daily count: combos count as their parts', () => {
  let rid, owner, other, coxinha, kibe, combo, cento, foreign;
  beforeAll(async () => {
    const o = await prisma.user.create({ data: { email: `dco-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER', businessType: 'lanchonete' } });
    rid = (await prisma.restaurant.create({ data: { name: `Dco ${tag}`, ownerId: o.id, status: 'ACTIVE', subscriptionTier: 'business' } })).id;
    await prisma.user.update({ where: { id: o.id }, data: { currentRestaurantId: rid } });
    owner = { id: o.id, email: o.email, role: 'OWNER' };
    const recipe = (r, name, dailyCount = false) => prisma.recipe.create({ data: { restaurantId: r, code: `R${seq++}${tag}`, name, baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 10, dailyCount } });
    coxinha = (await recipe(rid, 'Coxinha', true)).id;
    kibe = (await recipe(rid, 'Kibe', true)).id;
    combo = (await recipe(rid, 'Combo coxinha + refri')).id;
    cento = (await recipe(rid, 'Cento de coxinhas')).id;
    const o2 = await prisma.user.create({ data: { email: `dco2-${tag}@gastrux.test`, name: 'Outra', password: 'x', role: 'OWNER' } });
    const rid2 = (await prisma.restaurant.create({ data: { name: `Dco2 ${tag}`, ownerId: o2.id, status: 'ACTIVE' } })).id;
    other = { rid: rid2, userId: o2.id };
    foreign = (await recipe(rid2, 'Coxinha de outro', true)).id;
  }, 60000);
  afterAll(async () => {
    for (const r of [rid, other.rid]) {
      try { await prisma.order.deleteMany({ where: { restaurantId: r } }); } catch {}
      try { await prisma.orderSession.deleteMany({ where: { restaurantId: r } }); } catch {}
      try { await prisma.restaurant.deleteMany({ where: { id: r } }); } catch {}
    }
    try { await prisma.user.deleteMany({ where: { id: { in: [owner.id, other.userId] } } }); } catch {}
  });

  it('saves the parts, shows them, and refuses what cannot be a part', async () => {
    as(owner);
    expect((await put(combo, { ...base('Combo coxinha + refri'), countParts: [{ recipeId: coxinha, quantity: 1 }] })).status).toBe(200);
    expect((await put(cento, { ...base('Cento de coxinhas'), countParts: [{ recipeId: coxinha, quantity: 100 }] })).status).toBe(200);
    const shown = await (await RECIPE(new NextRequest('http://x'), { params: { id: combo } })).json();
    expect(shown.countParts.map((p) => [p.recipeId, p.name, p.quantity])).toEqual([[coxinha, 'Coxinha', 1]]);
    // Leaving countParts out keeps them
    expect((await put(combo, base('Combo coxinha + refri'))).status).toBe(200);
    expect(await prisma.recipeCountPart.count({ where: { recipeId: combo } })).toBe(1);

    const refused = [
      { countParts: [{ recipeId: combo, quantity: 1 }] },                 // itself
      { countParts: [{ recipeId: cento, quantity: 1 }] },                 // not counted
      { countParts: [{ recipeId: foreign, quantity: 1 }] },               // another restaurant's
      { countParts: [{ recipeId: coxinha, quantity: 0 }] },
      { countParts: [{ recipeId: coxinha, quantity: 1.5 }] },
      { countParts: [{ recipeId: coxinha, quantity: 1001 }] },
      { countParts: [{ recipeId: coxinha, quantity: 1 }], dailyCount: true }, // a counted item counts as itself
    ];
    for (const body of refused) {
      const res = await put(combo, { ...base('Combo coxinha + refri'), ...body });
      expect([res.status, JSON.stringify(body)]).toEqual([400, JSON.stringify(body)]);
    }
    // A counted item cannot get parts by turning the flag on either
    expect((await put(combo, { ...base('Combo coxinha + refri'), dailyCount: true })).status).toBe(400);
    expect((await prisma.recipe.findUnique({ where: { id: combo } })).dailyCount).toBe(false);
    expect(await prisma.recipeCountPart.findMany({ where: { recipeId: combo }, select: { partRecipeId: true, quantity: true } })).toEqual([{ partRecipeId: coxinha, quantity: 1 }]);
  });

  it('a combo sold counts as its parts; cancelled comandas and encomendas do not', async () => {
    as(owner);
    expect(await sold(coxinha)).toBe(0);
    const session = (status) => prisma.orderSession.create({ data: { restaurantId: rid, userId: owner.id, status, customerName: 'Balcão' } });
    const open = await session('OPEN');
    await prisma.orderSessionItem.createMany({ data: [
      { sessionId: open.id, recipeId: coxinha, quantity: 2, price: 8 },
      { sessionId: open.id, recipeId: combo, quantity: 3, price: 12 },
    ] });
    for (const status of ['CANCELLED', 'ENCOMENDA']) {
      const s = await session(status);
      await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId: cento, quantity: 1, price: 90 } });
    }
    // Site delivery: a kitchen order without a comanda
    await prisma.order.create({ data: { restaurantId: rid, orderNumber: `DCO${tag}`, status: 'COMPLETED', items: { create: [{ recipeId: cento, quantity: 1, status: 'COMPLETED' }] } } });
    expect(await sold(coxinha)).toBe(2 + 3 + 100);
    expect(await sold(kibe)).toBe(0);
  });

  it('the lanchonete example menu comes with its combo counting as a coxinha', async () => {
    const fresh = (await prisma.restaurant.create({ data: { name: `Dco seed ${tag}`, ownerId: owner.id, status: 'ACTIVE' } })).id;
    try {
      expect((await seedStarterTemplate(fresh, 'lanchonete')).seeded).toBe(true);
      const parts = await prisma.recipeCountPart.findMany({ where: { restaurantId: fresh }, include: { recipe: { select: { code: true } }, part: { select: { code: true } } } });
      expect(parts.map((p) => [p.recipe.code, p.part.code, p.quantity]).sort()).toContainEqual(['DEMO-R-CXR', 'DEMO-R-COX', 1]);
    } finally {
      await prisma.recipeIngredient.deleteMany({ where: { recipe: { restaurantId: fresh } } });
      await prisma.restaurant.delete({ where: { id: fresh } });
    }
  });

  it('a combo cancelled in the kitchen is a loss of its parts', async () => {
    await prisma.$transaction((tx) => recordKitchenCountLoss(tx, rid, [{ recipeId: combo, quantity: 2 }], { userId: owner.id, reason: 'cliente desistiu' }));
    const entries = await prisma.dailyCountEntry.findMany({ where: { restaurantId: rid, kind: 'LOSS' }, select: { recipeId: true, quantity: true } });
    expect(entries).toEqual([{ recipeId: coxinha, quantity: 2 }]);
  });
});
