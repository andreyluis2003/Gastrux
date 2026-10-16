// @ts-nocheck
/** Sales of a Brasília month, Caixa criterion (spec 2026-10-16 contas de consumo, 4.5) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { monthSalesCents } from '../../../lib/finance/month-sales';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('month sales', () => {
  let rid, otherRid, userId, shiftId, recipeId;
  beforeAll(async () => {
    const o = await prisma.user.create({ data: { email: `ums-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } });
    userId = o.id;
    rid = (await prisma.restaurant.create({ data: { name: `Ums ${tag}`, ownerId: o.id, status: 'ACTIVE' } })).id;
    otherRid = (await prisma.restaurant.create({ data: { name: `Ums2 ${tag}`, ownerId: o.id, status: 'ACTIVE' } })).id;
    const register = await prisma.cashRegister.create({ data: { name: 'Caixa', restaurantId: rid, isDefault: true } });
    shiftId = (await prisma.cashSession.create({ data: { restaurantId: rid, cashRegisterId: register.id, openedById: userId, openingFloatCents: 0 } })).id;
    recipeId = (await prisma.recipe.create({ data: { restaurantId: rid, code: `R${tag}`, name: 'X', baseYield: 1, yieldUnit: 'un', portionUnit: 'un' } })).id;
  });
  afterAll(async () => {
    try { await prisma.payment.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.restaurant.deleteMany({ where: { id: { in: [rid, otherRid] } } }); } catch {}
    try { await prisma.user.deleteMany({ where: { id: userId } }); } catch {}
  });

  const comanda = (status = 'CLOSED') => prisma.orderSession.create({ data: { restaurantId: rid, userId, status } });
  const receipt = (orderSessionId, amountCents, at) =>
    prisma.cashSessionEntry.create({ data: { restaurantId: rid, cashSessionId: shiftId, type: 'RECEIPT', method: 'CASH', amountCents, orderSessionId, createdById: userId, createdAt: at } });

  it('cash sales + online table payments + orders without a comanda, inside the Brasília month only', async () => {
    const a = await comanda();
    await receipt(a.id, 10000, new Date('2026-09-15T15:00:00Z'));
    await receipt(a.id, 5000, new Date('2026-10-01T02:00:00Z'));  // Sept 30, 23:00 in Brasília: September
    await receipt(a.id, 7000, new Date('2026-10-01T03:00:00Z'));  // Oct 1, 00:00 in Brasília: October
    const b = await comanda();
    await prisma.payment.create({ data: { restaurantId: rid, orderSessionId: b.id, amount: 30, amountRefunded: 10, method: 'PIX', status: 'APPROVED', appliedToBillAt: new Date('2026-09-20T15:00:00Z') } });
    await prisma.order.create({ data: { restaurantId: rid, orderNumber: `UMS${tag}1`, status: 'COMPLETED', total: 45, createdAt: new Date('2026-09-10T15:00:00Z'), items: { create: [{ recipeId, quantity: 1 }] } } });
    await prisma.order.create({ data: { restaurantId: rid, orderNumber: `UMS${tag}2`, status: 'CANCELLED', total: 99, createdAt: new Date('2026-09-10T15:00:00Z') } });
    await prisma.order.create({ data: { restaurantId: rid, orderNumber: `UMS${tag}3`, status: 'COMPLETED', total: 88, orderSessionId: a.id, createdAt: new Date('2026-09-10T15:00:00Z') } });
    await prisma.order.create({ data: { restaurantId: otherRid, orderNumber: `UMS${tag}4`, status: 'COMPLETED', total: 77, createdAt: new Date('2026-09-10T15:00:00Z') } });
    // 100 + 50 cash, 20 online after refund, 45 site delivery = R$ 215,00
    expect(await monthSalesCents(rid, '2026-09')).toBe(21500);
    expect(await monthSalesCents(rid, '2026-10')).toBe(7000);
  });
});
