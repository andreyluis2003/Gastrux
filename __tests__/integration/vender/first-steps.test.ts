// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { firstSteps, onboardingStatus } from '../../../lib/onboarding/first-steps';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('primeiros passos', () => {
  let ownerId, rid;
  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `fs-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `FS ${tag}`, ownerId, status: 'ACTIVE' } })).id;
  });
  afterAll(async () => {
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });
  const done = async () => Object.fromEntries((await firstSteps(rid)).map((s) => [s.key, s.done]));

  it('a new account has every step to do, in order', async () => {
    expect((await firstSteps(rid)).map((s) => s.key)).toEqual(['caixa', 'venda', 'cardapio', 'mesas', 'equipe', 'endereco', 'nfce']);
    expect(await done()).toEqual({ caixa: false, venda: false, cardapio: false, mesas: false, equipe: false, endereco: false, nfce: false });
  });

  it('each step is done by what the restaurant actually did', async () => {
    await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, status: 'CLOSED', tableNumber: 1 } });
    await prisma.restaurant.update({ where: { id: rid }, data: { address: 'Rua A, 1' } });
    const d = await done();
    expect(d.venda).toBe(true);
    expect(d.endereco).toBe(true);
    expect(d.caixa).toBe(false);
  });

  it('an account started blank has its products step done as soon as it adds an item', async () => {
    const blank = (await prisma.restaurant.create({ data: { name: `Blank ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    try {
      const c = await prisma.menuCategory.create({ data: { restaurantId: blank, name: 'Lanches', position: 0, active: true } });
      await prisma.menuItem.create({ data: { restaurantId: blank, categoryId: c.id, name: 'X-Burger', price: 20, position: 0 } });
      expect((await firstSteps(blank)).find((s) => s.key === 'cardapio').done).toBe(true);
    } finally { await prisma.restaurant.delete({ where: { id: blank } }); }
  });

  it('an account started from the example menu has it done only for an item of its own', async () => {
    const demo = (await prisma.restaurant.create({ data: { name: `Demo ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    try {
      const r = await prisma.recipe.create({ data: { restaurantId: demo, code: `DEMO-${tag}`, name: 'Burger', baseYield: 1, yieldUnit: 'un', portionUnit: 'un' } });
      const c = await prisma.menuCategory.create({ data: { restaurantId: demo, name: 'Lanches', position: 0, active: true } });
      await prisma.menuItem.create({ data: { restaurantId: demo, categoryId: c.id, name: 'Burger', price: 20, position: 0, recipeId: r.id } });
      expect((await firstSteps(demo)).find((s) => s.key === 'cardapio').done).toBe(false);
    } finally {
      await prisma.recipeIngredient.deleteMany({ where: { recipe: { restaurantId: demo } } });
      await prisma.restaurant.delete({ where: { id: demo } });
    }
  });

  it('tables and team are done by real rows; the example tables do not count; team is optional', async () => {
    const s = await prisma.tableSection.create({ data: { restaurantId: rid, name: `Salão ${tag}`, capacity: 40 } });
    await prisma.table.create({ data: { restaurantId: rid, sectionId: s.id, number: 1, capacity: 4, description: 'Mesa de exemplo' } });
    expect((await firstSteps(rid)).find((x) => x.key === 'mesas').done).toBe(false);
    await prisma.table.create({ data: { restaurantId: rid, sectionId: s.id, number: 3, capacity: 4 } });
    expect((await firstSteps(rid)).find((x) => x.key === 'mesas').done).toBe(true);
    const equipe = (await firstSteps(rid)).find((x) => x.key === 'equipe');
    expect(equipe).toMatchObject({ done: false, optional: true });
    const u = await prisma.user.create({ data: { email: `fs-c-${tag}@gastrux.test`, name: 'Zé', password: 'x', role: 'COOK' } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: u.id, role: 'COOK', permissions: [], acceptedAt: new Date() } });
    expect((await firstSteps(rid)).find((x) => x.key === 'equipe').done).toBe(true);
    await prisma.restaurantUser.deleteMany({ where: { userId: u.id } }); await prisma.user.delete({ where: { id: u.id } });
  });

  it('onboardingStatus: required steps only, active for 30 days', async () => {
    const st = await onboardingStatus(rid);
    expect(st.total).toBe(6);
    expect(st.active).toBe(true);
    expect(st.next).toMatchObject({ key: 'caixa' });
    const later = new Date(Date.now() + 31 * 86400000);
    expect((await onboardingStatus(rid, later)).active).toBe(false);
  });
});
