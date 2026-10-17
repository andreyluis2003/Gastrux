// @ts-nocheck
/** "Uso da IA": questions of the month, managers only, own restaurant only (spec 2026-10-16 ia-assistente §4.6) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { GET as USAGE } from '../../../app/api/ai/usage/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const as = (u) => {
  const s = { user: u, expires: '2099-01-01' };
  (getServerSession as jest.Mock).mockResolvedValue(s);
  (getServerSessionNext as jest.Mock).mockResolvedValue(s);
};

describe('AI usage', () => {
  let rid, otherRid, owner, cook, userIds = [];
  beforeAll(async () => {
    const o = await prisma.user.create({ data: { email: `aiu-o-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } });
    rid = (await prisma.restaurant.create({ data: { name: `Aiu ${tag}`, ownerId: o.id, status: 'ACTIVE', subscriptionTier: 'pro' } })).id;
    otherRid = (await prisma.restaurant.create({ data: { name: `Aiu2 ${tag}`, ownerId: o.id, status: 'ACTIVE' } })).id;
    await prisma.user.update({ where: { id: o.id }, data: { currentRestaurantId: rid } });
    owner = { id: o.id, email: o.email, role: 'OWNER' };
    const c = await prisma.user.create({ data: { email: `aiu-c-${tag}@gastrux.test`, name: 'Zé', password: 'x', role: 'COOK', currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: c.id, role: 'COOK', permissions: [], acceptedAt: new Date() } });
    cook = { id: c.id, email: c.email, role: 'COOK' };
    userIds = [o.id, c.id];
    await prisma.aiQuestion.createMany({ data: [
      { restaurantId: rid, userId: c.id, role: 'COOK', question: 'O que vence hoje?', answer: 'Nada vence hoje.', model: 'claude-haiku-5-5', counted: true },
      { restaurantId: rid, userId: o.id, role: 'OWNER', question: 'Quanto vendi?', answer: null, model: 'claude-haiku-5-5', counted: false, error: '500' },
      { restaurantId: otherRid, userId: o.id, role: 'OWNER', question: 'pergunta de outro restaurante', counted: true },
    ] });
  });
  afterAll(async () => {
    try { await prisma.restaurant.deleteMany({ where: { id: { in: [rid, otherRid] } } }); } catch {}
    try { await prisma.user.deleteMany({ where: { id: { in: userIds } } }); } catch {}
  });

  it('owner sees the plan, the counted questions and the list of this restaurant only', async () => {
    as(owner);
    const res = await USAGE();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ plan: 'pro', used: 1, limit: 150 });
    expect(body.questions.map((q) => q.question).sort()).toEqual(['O que vence hoje?', 'Quanto vendi?']);
    expect(body.questions.find((q) => q.question === 'O que vence hoje?')).toMatchObject({ userName: 'Zé', role: 'COOK', counted: true });
  });

  it('the cook gets 403', async () => {
    as(cook);
    expect((await USAGE()).status).toBe(403);
  });
});
