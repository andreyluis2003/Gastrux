// @ts-nocheck
/**
 * Pendências M9 (owner, 2026-10-23: "somar como perda"): an espeto the kitchen had started and that is cancelled
 * (the whole order, or the line taken off the comanda) is neither sold nor counted as a loss, so the count showed
 * it as "faltam". Now it becomes a LOSS "Cancelado na cozinha" of the open night; before the kitchen started, nothing.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { cancelOrder } from '../../../lib/kds-cancel-order';
import { openNight } from '../../../lib/daily-count/service';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
let seq = 0;

describe('daily count: espeto cancelled in the kitchen', () => {
  let rid: string, ownerId: string, espeto: string, vinagrete: string;
  const order = (status: string, items: { recipeId: string; quantity: number }[]) => prisma.order.create({
    data: { restaurantId: rid, orderNumber: `KL${tag}${seq++}`, status, items: { create: items.map((i) => ({ ...i, status: status === 'PENDING' ? 'PENDING' : 'PREPARING' })) } },
  });
  const losses = async () => {
    const night = await openNight(prisma, rid);
    return prisma.dailyCountEntry.findMany({ where: { countId: night.id, kind: 'LOSS' }, select: { recipeId: true, quantity: true, reason: true, userId: true } });
  };

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `kl-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `Kl ${tag}`, ownerId, status: 'ACTIVE', subscriptionTier: 'pro' } })).id;
    const recipe = (name, dailyCount) => prisma.recipe.create({ data: { restaurantId: rid, code: `R${tag}${seq++}`, name, baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 10, dailyCount } });
    espeto = (await recipe('Espeto de frango', true)).id;
    vinagrete = (await recipe('Vinagrete', false)).id;
  }, 60000);
  afterAll(async () => {
    await prisma.order.deleteMany({ where: { restaurantId: rid } });
    await prisma.restaurant.delete({ where: { id: rid } });
    await prisma.auditLog.deleteMany({ where: { userId: ownerId } });
    await prisma.user.delete({ where: { id: ownerId } });
  });

  it('not started: nothing; started: the counted recipes become a loss of the open night', async () => {
    const pending = await order('PENDING', [{ recipeId: espeto, quantity: 2 }]);
    await cancelOrder(pending.id, { restaurantId: rid, userId: ownerId, reason: 'cliente desistiu' });
    expect(await losses()).toEqual([]);

    const cooking = await order('PREPARING', [{ recipeId: espeto, quantity: 3 }, { recipeId: vinagrete, quantity: 1 }]);
    await cancelOrder(cooking.id, { restaurantId: rid, userId: ownerId, reason: 'caiu no chão' });
    expect(await losses()).toEqual([{ recipeId: espeto, quantity: 3, reason: 'Cancelado na cozinha: caiu no chão', userId: ownerId }]);

    // A second cancel of the same order adds nothing
    await cancelOrder(cooking.id, { restaurantId: rid, userId: ownerId });
    expect((await losses()).length).toBe(1);
  });

  it('without a user (an integration cancelling), the loss is in the owner\'s name', async () => {
    const before = (await losses()).length;
    const cooking = await order('READY', [{ recipeId: espeto, quantity: 1 }]);
    await cancelOrder(cooking.id, { restaurantId: rid });
    const all = await losses();
    expect(all.length).toBe(before + 1);
    expect(all.at(-1)).toMatchObject({ quantity: 1, reason: 'Cancelado na cozinha', userId: ownerId });
  });
});
