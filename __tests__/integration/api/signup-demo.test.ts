// @ts-nocheck
/**
 * A brand-new account opens on a dashboard with examples, not with a problem (2026-10-05): the 12 demo
 * ingredients were created with minimumStock 1 and no stock count, so every new account started with
 * "Estoque Baixo: 12". The examples stay (they show the cost of each dish); the alert waits until the
 * owner sets a real minimum.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { POST as signup } from '../../../app/api/signup/route';
import { getDashboardStats } from '../../../lib/dashboard/stats';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('new account: examples without a false low-stock alert', () => {
  const email = `signup-demo-${crypto.randomBytes(4).toString('hex')}@gastrux.test`;
  let restaurantId: string;
  let userId: string;

  beforeAll(async () => {
    // The welcome e-mail is fire-and-forget; keep it off the network
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    const res = await signup(new Request('http://x/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Teste#12345', name: 'Signup Demo', acceptedTerms: true }),
    }) as any);
    expect(res.status).toBe(201);
    const body = await res.json();
    restaurantId = body.restaurant.id;
    userId = body.user.id;
  });

  afterAll(async () => {
    try {
      await prisma.restaurant.delete({ where: { id: restaurantId } });
      await prisma.user.delete({ where: { id: userId } });
    } catch {
      // Left in the local test database under a unique e-mail
    }
  });

  it('comes with example ingredients and recipes', async () => {
    const stats = await getDashboardStats(restaurantId);
    expect(stats.ingredients.value).toBeGreaterThan(0);
    expect(stats.recipes.value).toBeGreaterThan(0);
  });

  it('does not start with a low-stock alert', async () => {
    const stats = await getDashboardStats(restaurantId);
    expect(stats.lowStock.value).toBe(0);
  });
});
