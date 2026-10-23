// @ts-nocheck
/**
 * Owner-and-manager data refused to the cook and the cashier (prod audit 2026-10-17: these routes checked only the
 * session and the restaurant, so any member of the restaurant could read customers, finances, CMV and margins).
 * The check runs before anything else, so mutating calls are only tried with roles that must be refused.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const as = (u) => { const s = { user: u, expires: '2099-01-01' }; getServerSession.mockResolvedValue(s); getServerSessionNext.mockResolvedValue(s); };

const M = 'managers';
// [route module, method, who may call it, params]
const ROUTES: Array<[string, string, string, any?]> = [
  ['customers/route', 'GET', M], ['customers/route', 'POST', M],
  ['customers/[id]/route', 'GET', M, { id: 'x' }], ['customers/[id]/route', 'PUT', M, { id: 'x' }],
  ['customers/[id]/interactions/route', 'GET', M, { id: 'x' }], ['customers/[id]/interactions/route', 'POST', M, { id: 'x' }],
  ['financeiro/resumo/route', 'GET', M], ['cashback/settings/route', 'GET', M], ['cashback/settings/route', 'PUT', M], ['cashback/summary/route', 'GET', M],
  ['pagamentos/route', 'GET', M],
  ['reports/profitability/route', 'GET', M],
  ['reports/executive/route', 'GET', M],
  ['cmv/route', 'GET', M], ['cmv/history/route', 'GET', M], ['cmv/snapshot/route', 'POST', M],
  ['menu-engineering/route', 'GET', M], ['menu-engineering/history/route', 'GET', M], ['menu-engineering/snapshot/route', 'POST', M],
];

describe('owner-and-manager routes refuse the cook and the cashier', () => {
  let rid, people = {}, ids = [], handlers = {};
  beforeAll(async () => {
    const o = await prisma.user.create({ data: { email: `rg-o-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } });
    rid = (await prisma.restaurant.create({ data: { name: `Rg ${tag}`, ownerId: o.id, status: 'ACTIVE', subscriptionTier: 'business' } })).id;
    await prisma.user.update({ where: { id: o.id }, data: { currentRestaurantId: rid } });
    people.OWNER = { id: o.id, email: o.email, role: 'OWNER' };
    ids.push(o.id);
    for (const role of ['MANAGER', 'CASHIER', 'COOK']) {
      const u = await prisma.user.create({ data: { email: `rg-${role.toLowerCase()}-${tag}@gastrux.test`, name: role, password: 'x', role, currentRestaurantId: rid } });
      await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: u.id, role, permissions: [], acceptedAt: new Date() } });
      people[role] = { id: u.id, email: u.email, role };
      ids.push(u.id);
    }
    // Compile every route once here: a cold require of a route and its imports is slow on a small machine
    for (const [mod] of ROUTES) handlers[mod] = require(`../../../app/api/${mod}`);
  }, 600_000);
  afterAll(async () => {
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.deleteMany({ where: { id: { in: ids } } }); } catch {}
  });

  const call = async (mod, method, params) => {
    const handler = handlers[mod][method];
    const body = ['GET', 'DELETE'].includes(method) ? undefined : JSON.stringify({});
    const req = new Request(`http://x/api/${mod.replace(/\/route$/, '')}`, { method, body, headers: { 'content-type': 'application/json' } });
    (req as any).nextUrl = new URL(req.url);
    return handler(req, { params: params ?? {} });
  };

  // Every row with 4 values: a row of 3 would make Jest take the 4th argument for a done callback and wait forever
  it.each(ROUTES.map(([mod, method, who, params]) => [mod, method, who, params ?? {}]))('%s %s', async (mod, method, who, params) => {
    as(people.COOK);
    expect((await call(mod, method, params)).status).toBe(403);
    as(people.CASHIER);
    const cashier = (await call(mod, method, params)).status;
    if (who === M) expect(cashier).toBe(403); else expect(cashier).not.toBe(403);
    if (method === 'GET') {
      for (const role of ['OWNER', 'MANAGER']) {
        as(people[role]);
        expect((await call(mod, method, params)).status).not.toBe(403);
      }
    }
  });
});
