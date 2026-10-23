// @ts-nocheck
/** Cashback settings, the phone lookup and the CRM by phone (spec 2026-10-23 §9, §10) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { GET as SETTINGS, PUT as SAVE_SETTINGS } from '../../../app/api/cashback/settings/route';
import { GET as SUMMARY } from '../../../app/api/cashback/summary/route';
import { GET as LOOKUP } from '../../../app/api/cashback/customer/route';
import { GET as LIST, POST as CREATE } from '../../../app/api/customers/route';
import { GET as ONE } from '../../../app/api/customers/[id]/route';
import { upsertCustomerByPhone } from '../../../lib/cashback/service';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('cashback screens and CRM', () => {
  let rid, otherRid, users = {}, maria;
  const as = (k) => {
    const s = { user: { id: users[k].id, email: users[k].email }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(s);
    (getServerSessionNext as jest.Mock).mockResolvedValue(s);
  };
  const req = (url, method = 'GET', body?) => new NextRequest(`http://x${url}`, body ? { method, body: JSON.stringify(body) } : { method });

  beforeAll(async () => {
    const mkUser = async (k, role) => {
      const email = `cbs-${k}-${tag}@gastrux.test`;
      users[k] = { id: (await prisma.user.create({ data: { email, name: k, password: 'x', role } })).id, email };
    };
    await mkUser('owner', 'OWNER');
    await mkUser('cashier', 'CASHIER');
    rid = (await prisma.restaurant.create({ data: { name: `S ${tag}`, ownerId: users.owner.id, status: 'ACTIVE', subscriptionTier: 'business', subscriptionStatus: 'active', isInternal: false } })).id;
    otherRid = (await prisma.restaurant.create({ data: { name: `S2 ${tag}`, ownerId: users.owner.id, status: 'ACTIVE' } })).id;
    for (const [k, role] of [['owner', 'OWNER'], ['cashier', 'CASHIER']]) {
      await prisma.user.update({ where: { id: users[k].id }, data: { currentRestaurantId: rid } });
      await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: users[k].id, role, permissions: [], acceptedAt: new Date() } });
    }
    maria = await upsertCustomerByPhone(prisma, rid, '11999990000', 'Maria');
    await upsertCustomerByPhone(prisma, otherRid, '11988880000', 'Alheia');
    await prisma.cashbackCredit.create({ data: { restaurantId: rid, customerId: maria.id, amountCents: 1500, remainingCents: 1500, expiresAt: new Date(Date.now() + 10 * 864e5) } });
    // 3 closed bills in the last 90 days: Regular
    for (let i = 0; i < 3; i++) {
      await prisma.orderSession.create({ data: { restaurantId: rid, userId: users.owner.id, status: 'CLOSED', closedAt: new Date(Date.now() - i * 864e5), customerId: maria.id } });
    }
  }, 60000);

  afterAll(async () => {
    const ids = [rid, otherRid];
    await prisma.cashbackCredit.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashbackSettings.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: Object.values(users).map((u) => u.id) } } });
    for (const id of ids) { try { await prisma.restaurant.delete({ where: { id } }); } catch {} }
    try { await prisma.customer.deleteMany({ where: { restaurantId: { in: ids } } }); } catch {}
    try { await prisma.user.deleteMany({ where: { id: { in: Object.values(users).map((u) => u.id) } } }); } catch {}
  });

  it('settings: defaults, limits, saved and audited; the cashier cannot change them', async () => {
    as('owner');
    expect(await (await SETTINGS(req('/api/cashback/settings'))).json()).toMatchObject({ enabled: true, percent: 5, validityMonths: 6, minUseCents: 1000, available: true });
    expect((await SAVE_SETTINGS(req('/api/cashback/settings', 'PUT', { enabled: true, percent: '31', validityMonths: 6, minUseCents: 1000 }))).status).toBe(400);
    const saved = await SAVE_SETTINGS(req('/api/cashback/settings', 'PUT', { enabled: true, percent: '7,5', validityMonths: 3, minUseCents: 500 }));
    expect(await saved.json()).toMatchObject({ percent: 7.5, validityMonths: 3, minUseCents: 500 });
    expect(await prisma.auditLog.count({ where: { entityType: 'CashbackSettings', entityId: rid } })).toBe(1);
    as('cashier');
    expect((await SAVE_SETTINGS(req('/api/cashback/settings', 'PUT', { enabled: false, percent: 5, validityMonths: 6, minUseCents: 0 }))).status).toBe(403);
  });

  it('the phone lookup finds only this restaurant\'s customer, with the balance', async () => {
    as('cashier');
    expect(await (await LOOKUP(req('/api/cashback/customer?phone=(11)99999-0000'))).json()).toMatchObject({ customer: { id: maria.id, name: 'Maria' }, balanceCents: 1500, available: true });
    expect(await (await LOOKUP(req('/api/cashback/customer?phone=11988880000'))).json()).toMatchObject({ customer: null, balanceCents: 0 });
  });

  it('summary: open balance and what expires in 30 days', async () => {
    as('owner');
    expect(await (await SUMMARY(req('/api/cashback/summary'))).json()).toMatchObject({ openCents: 1500, expiringCents: 1500 });
  });

  it('CRM: search by phone digits, segment from the last 90 days, create without e-mail', async () => {
    as('owner');
    const list = await (await LIST(req('/api/customers?search=99999'))).json();
    expect(list.customers.map((c) => c.name)).toEqual(['Maria']);
    expect(list.customers[0].segment).toBe('REGULAR');
    const regular = await (await LIST(req('/api/customers?segment=REGULAR'))).json();
    expect(regular.customers.map((c) => c.id)).toEqual([maria.id]);
    const created = await CREATE(req('/api/customers', 'POST', { name: 'Sem Email', phone: '11977770000' }));
    expect(created.status).toBe(201);
    expect((await CREATE(req('/api/customers', 'POST', { name: 'Dup', phone: '(11) 97777-0000' }))).status).toBe(409);
    expect((await CREATE(req('/api/customers', 'POST', { name: 'Nada' }))).status).toBe(400);
    const one = await (await ONE(req(`/api/customers/${maria.id}`), { params: { id: maria.id } })).json();
    expect(one).toMatchObject({ segment: 'REGULAR', cashbackBalanceCents: 1500 });
    expect(one.cashbackStatement[0]).toMatchObject({ kind: 'CREDIT', amountCents: 1500 });
  });
});
