// @ts-nocheck
/** Minha assinatura > Indique e ganhe (plan 2026-10-24 indicacao, Task 7) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { GET } from '../../../app/api/referrals/mine/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
let seq = 0;
const users: string[] = [];
const as = (u) => {
  const s = { user: u, expires: '2099-01-01' };
  (getServerSession as jest.Mock).mockResolvedValue(s);
  (getServerSessionNext as jest.Mock).mockResolvedValue(s);
};

async function user(role = 'OWNER') {
  const u = await prisma.user.create({ data: { email: `rfm-${seq++}-${tag}@gastrux.test`, name: 'Pessoa', password: 'x', role } });
  users.push(u.id);
  return u;
}

let owner, cashier, rid;
beforeAll(async () => {
  owner = await user();
  rid = (await prisma.restaurant.create({ data: { name: `Rfm ${tag}`, ownerId: owner.id, status: 'ACTIVE', subscriptionTier: 'pro', subscriptionStatus: 'active' } })).id;
  await prisma.user.update({ where: { id: owner.id }, data: { currentRestaurantId: rid } });
  cashier = await user('CASHIER');
  await prisma.user.update({ where: { id: cashier.id }, data: { currentRestaurantId: rid } });
  await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: cashier.id, role: 'CASHIER', permissions: [], acceptedAt: new Date() } });
  const states = ['TRIAL', 'CONFIRMING', 'EARNED', 'APPLIED', 'CANCELLED'];
  for (const status of states) {
    const o = await user();
    const r = await prisma.restaurant.create({ data: { name: `Indicado ${status} ${tag}`, ownerId: o.id, email: `segredo-${status}@cliente.test`, phone: '11999990000' } });
    await prisma.referral.create({ data: { referrerRestaurantId: rid, referredRestaurantId: r.id, status, earnedAt: ['EARNED', 'APPLIED'].includes(status) ? new Date() : null } });
  }
}, 60000);
afterAll(async () => {
  await prisma.restaurantUser.deleteMany({ where: { userId: { in: users } } });
  await prisma.restaurant.deleteMany({ where: { ownerId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
});

it('the owner gets the code, the link, the rule and the list', async () => {
  as({ id: owner.id, email: owner.email, role: 'OWNER' });
  const res = await GET();
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  expect(body.link).toBe(`https://gastrux.com/?ref=${body.code}`);
  expect(body.rule).toBe('Ganhe 1 mês grátis para cada restaurante que assinar pelo seu link');
  expect(body.counts).toEqual({ trial: 1, confirming: 1, earned: 1, applied: 1, cancelled: 1 });
  expect(body.monthsThisYear).toBe(2);
  expect(body.items).toHaveLength(5);
  // the same code on the next visit
  expect((await (await GET()).json()).code).toBe(body.code);
});

it('the list carries no e-mail or phone of the referred restaurants', async () => {
  as({ id: owner.id, email: owner.email, role: 'OWNER' });
  const raw = JSON.stringify(await (await GET()).json());
  expect(raw).not.toMatch(/segredo-|cliente\.test|11999990000/);
});

it('a cashier gets 403', async () => {
  as({ id: cashier.id, email: cashier.email, role: 'CASHIER' });
  expect((await GET()).status).toBe(403);
});
