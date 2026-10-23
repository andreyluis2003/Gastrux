// @ts-nocheck
/** Cashback service (spec docs/superpowers/specs/2026-10-23-cashback-design.md) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import {
  balanceCents, creditSale, getCashbackSettings, recordPurchase, removeUse, reverseForSession, undoPurchase,
  upsertCustomerByPhone, useOnSession,
} from '../../../lib/cashback/service';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const DAY = 864e5;

describe('cashback service', () => {
  let ownerId, A, B, pro, s1, s2, s3;
  const restaurant = (name, tier) => prisma.restaurant.create({ data: { name: `${name} ${tag}`, ownerId, status: 'ACTIVE', subscriptionTier: tier, subscriptionStatus: 'active', isInternal: false } });
  const session = (rid) => prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId } });

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `cb-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } })).id;
    A = (await restaurant('A', 'business')).id;
    B = (await restaurant('B', 'business')).id;
    pro = (await restaurant('Pro', 'pro')).id;
    s1 = (await session(A)).id;
    s2 = (await session(A)).id;
    s3 = (await session(A)).id;
  });
  afterAll(async () => {
    const ids = [A, B, pro];
    await prisma.cashbackUse.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashbackCredit.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashbackSettings.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.orderSession.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.customer.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.restaurant.deleteMany({ where: { id: { in: ids } } });
    await prisma.user.delete({ where: { id: ownerId } });
  });

  it('defaults when the owner never saved a rule; Pro has no cashback', async () => {
    expect(await getCashbackSettings(A)).toMatchObject({ enabled: true, percent: 5, validityMonths: 6, minUseCents: 1000, available: true });
    expect((await getCashbackSettings(pro)).available).toBe(false);
  });

  it('the same phone in two restaurants is two customers; a new one needs a name', async () => {
    await expect(upsertCustomerByPhone(prisma, A, '11999998888', null)).rejects.toThrow('Informe o nome do cliente');
    const a = await upsertCustomerByPhone(prisma, A, '11999998888', 'Maria');
    const again = await upsertCustomerByPhone(prisma, A, '11999998888', null);
    const b = await upsertCustomerByPhone(prisma, B, '11999998888', 'Maria');
    expect(again.id).toBe(a.id);
    expect(b.id).not.toBe(a.id);
    expect(a).toMatchObject({ phone: '(11) 99999-8888', phoneDigits: '11999998888', email: null });
  });

  it('credits 5% once per sale, never in another restaurant, not on Pro or when disabled', async () => {
    const maria = await upsertCustomerByPhone(prisma, A, '11999998888', null);
    expect(await creditSale(prisma, { restaurantId: A, customerId: maria.id, baseCents: 3000, orderSessionId: s1 })).toBe(150);
    expect(await creditSale(prisma, { restaurantId: A, customerId: maria.id, baseCents: 3000, orderSessionId: s1 })).toBe(0);
    expect(await balanceCents(prisma, A, maria.id)).toBe(150);
    const inB = await upsertCustomerByPhone(prisma, B, '11999998888', null);
    expect(await balanceCents(prisma, B, inB.id)).toBe(0);
    const proCustomer = await upsertCustomerByPhone(prisma, pro, '11988887777', 'Zé');
    expect(await creditSale(prisma, { restaurantId: pro, customerId: proCustomer.id, baseCents: 3000, orderId: `o-${tag}` })).toBe(0);
    await prisma.cashbackSettings.create({ data: { restaurantId: B, enabled: false } });
    expect(await creditSale(prisma, { restaurantId: B, customerId: inB.id, baseCents: 3000, orderId: `ob-${tag}` })).toBe(0);
  });

  it('an expired credit is not in the balance', async () => {
    const zeca = await upsertCustomerByPhone(prisma, A, '11977776666', 'Zeca');
    await prisma.cashbackCredit.create({ data: { restaurantId: A, customerId: zeca.id, amountCents: 500, remainingCents: 500, expiresAt: new Date(Date.now() - DAY) } });
    expect(await balanceCents(prisma, A, zeca.id)).toBe(0);
  });

  it('use, remove, and the bill shows it', async () => {
    const maria = await upsertCustomerByPhone(prisma, A, '11999998888', null);
    await useOnSession(prisma, { restaurantId: A, customerId: maria.id, orderSessionId: s2, cents: 120 });
    expect(await balanceCents(prisma, A, maria.id)).toBe(30);
    expect((await prisma.orderSession.findUnique({ where: { id: s2 } })).cashbackUsedCents).toBe(120);
    await expect(useOnSession(prisma, { restaurantId: A, customerId: maria.id, orderSessionId: s3, cents: 100 })).rejects.toThrow('Saldo insuficiente');
    await removeUse(prisma, A, s2);
    expect(await balanceCents(prisma, A, maria.id)).toBe(150);
    expect((await prisma.orderSession.findUnique({ where: { id: s2 } })).cashbackUsedCents).toBe(0);
    // Used again after removing: the same bill can use again
    await useOnSession(prisma, { restaurantId: A, customerId: maria.id, orderSessionId: s2, cents: 100 });
    expect(await balanceCents(prisma, A, maria.id)).toBe(50);
  });

  it('reversing a sale whose credit was partly spent reverses what is left and reports the rest', async () => {
    const maria = await upsertCustomerByPhone(prisma, A, '11999998888', null);
    // s1 credited 150; s2 spent 100 of it
    const r = await reverseForSession(prisma, A, s1);
    expect(r.notReversedCents).toBe(100);
    expect(await balanceCents(prisma, A, maria.id)).toBe(0);
    // Closed again after the reopening: credited again, the same row revived
    expect(await creditSale(prisma, { restaurantId: A, customerId: maria.id, baseCents: 2000, orderSessionId: s1 })).toBe(100);
    expect(await balanceCents(prisma, A, maria.id)).toBe(100);
    // Reversing s2 gives its 100 back to the credit it came from
    await reverseForSession(prisma, A, s2);
    expect(await balanceCents(prisma, A, maria.id)).toBe(100);
  });

  it('purchases add to the CRM totals and can be undone', async () => {
    const ana = await upsertCustomerByPhone(prisma, A, '11966665555', 'Ana');
    const at = new Date();
    await recordPurchase(prisma, ana.id, 3000, at);
    await recordPurchase(prisma, ana.id, 1000, at);
    let c = await prisma.customer.findUnique({ where: { id: ana.id } });
    expect([Number(c.totalSpent), c.totalOrders, Number(c.averageTicket)]).toEqual([40, 2, 20]);
    await undoPurchase(prisma, ana.id, 1000);
    c = await prisma.customer.findUnique({ where: { id: ana.id } });
    expect([Number(c.totalSpent), c.totalOrders, Number(c.averageTicket)]).toEqual([30, 1, 30]);
  });
});
