// @ts-nocheck
/**
 * Plataforma > Custo da IA (pendências M7 of 2026-10-16, owner asked 2026-10-23): per restaurant and Brasília month,
 * the questions against the plan limit, the cost in US$, the tokens and the errors. Platform admins only.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { GET as COSTS } from '../../../app/api/admin/platform/ai-costs/route';
import { aiCostsByMonth } from '../../../lib/admin/ai-costs';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('AI cost per restaurant', () => {
  let ownerId: string, a: string, b: string;
  const ask = (restaurantId, createdAt, extra = {}) => prisma.aiQuestion.create({ data: {
    restaurantId, userId: ownerId, role: 'OWNER', question: 'q', createdAt: new Date(createdAt),
    inputTokens: 1000, outputTokens: 200, cacheReadTokens: 500, cacheWriteTokens: 100, costUsd: 0.01, ...extra,
  } });

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `aic-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } })).id;
    a = (await prisma.restaurant.create({ data: { name: `Aic A ${tag}`, ownerId, status: 'ACTIVE', isInternal: false, subscriptionTier: 'pro', subscriptionStatus: 'active' } })).id;
    b = (await prisma.restaurant.create({ data: { name: `Aic B ${tag}`, ownerId, status: 'ACTIVE', isInternal: false, subscriptionTier: 'business', subscriptionStatus: 'active' } })).id;
    // October in Brasília: from 2026-10-01 03:00Z to 2026-11-01 03:00Z
    await ask(a, '2026-10-01T02:59:00Z'); // still September in Brasília
    await ask(a, '2026-10-05T15:00:00Z');
    await ask(a, '2026-10-06T15:00:00Z', { costUsd: 0.05, detailed: true });
    await ask(a, '2026-10-07T15:00:00Z', { costUsd: 0.002, counted: false, error: '529 overloaded' });
    await ask(b, '2026-10-20T15:00:00Z', { costUsd: 0.2, attachments: { images: 2, pdf: false } });
  }, 60000);
  afterAll(async () => {
    await prisma.restaurant.deleteMany({ where: { id: { in: [a, b] } } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
  });

  it('sums the Brasília month per restaurant, most expensive first, with the plan limit', async () => {
    const out = await aiCostsByMonth('2026-10');
    const rows = out.restaurants.filter((r) => [a, b].includes(r.restaurantId));
    expect(rows.map((r) => r.restaurantId)).toEqual([b, a]);
    expect(rows[1]).toMatchObject({ name: `Aic A ${tag}`, tier: 'pro', questions: 2, limit: 50, errors: 1, detailed: 1, withFiles: 0,
      inputTokens: 3000, outputTokens: 600, cacheReadTokens: 1500, cacheWriteTokens: 300 });
    expect(rows[1].costUsd).toBeCloseTo(0.062, 6);
    expect(rows[0]).toMatchObject({ tier: 'business', questions: 1, limit: 350, withFiles: 1 });
    expect(out.totals.costUsd).toBeGreaterThanOrEqual(0.262 - 1e-9);
    expect((await aiCostsByMonth('2026-09')).restaurants.find((r) => r.restaurantId === a)).toMatchObject({ questions: 1 });
  });

  it('platform admins only; a bad month is refused', async () => {
    getServerSession.mockResolvedValue({ user: { id: ownerId, email: `aic-${tag}@gastrux.test`, role: 'OWNER' }, expires: '2099-01-01' });
    expect((await COSTS(new NextRequest('http://x/api/admin/platform/ai-costs?month=2026-10'))).status).toBe(401);
    getServerSession.mockResolvedValue({ user: { id: 'adm', email: 'adm@gastrux.test', role: 'ADMIN' }, expires: '2099-01-01' });
    const res = await COSTS(new NextRequest('http://x/api/admin/platform/ai-costs?month=2026-10'));
    expect(res.status).toBe(200);
    expect((await res.json()).restaurants.some((r) => r.restaurantId === b)).toBe(true);
    expect((await COSTS(new NextRequest('http://x/api/admin/platform/ai-costs?month=2026-13'))).status).toBe(400);
  });
});
