// @ts-nocheck
/**
 * A new account: sign-up, then the questions with "Comece com" and the address (2026-10-06).
 * - the example menu follows the business type chosen (pizzaria gets pizzas), or none when the owner
 *   starts blank; "Pular por enquanto" keeps the general example every account used to get;
 * - examples never come with a false "Estoque Baixo" (minimum stock 0, fixed 2026-10-05);
 * - answering twice never duplicates the examples;
 * - the address is saved when given and may be left for later.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { POST as signup } from '../../../app/api/signup/route';
import { POST as qualify } from '../../../app/api/onboarding/qualification/route';
import { getDashboardStats } from '../../../lib/dashboard/stats';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

const answers = { businessStage: 'operating', locationCount: '1', mainPainPoint: 'cmv' };

async function newAccount() {
  const email = `signup-demo-${crypto.randomBytes(4).toString('hex')}@gastrux.test`;
  const res = await signup(new Request('http://x/api/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Teste#12345', name: 'Signup Demo', acceptedTerms: true }),
  }) as any);
  expect(res.status).toBe(201);
  const body = await res.json();
  return { userId: body.user.id, restaurantId: body.restaurant.id };
}

function answer(userId: string, payload: any) {
  (getServerSession as jest.Mock).mockResolvedValue({ user: { id: userId } });
  return qualify(new Request('http://x/api/onboarding/qualification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }) as any);
}

describe('new account: "Comece com" and address in the sign-up questions', () => {
  const made: Array<{ userId: string; restaurantId: string }> = [];

  beforeAll(() => {
    // The welcome e-mail is fire-and-forget; keep it off the network
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  });

  afterAll(async () => {
    for (const a of made) {
      try {
        await prisma.restaurant.delete({ where: { id: a.restaurantId } });
        await prisma.user.delete({ where: { id: a.userId } });
      } catch {
        // Left in the local test database under a unique e-mail
      }
    }
  });

  it('the sign-up alone creates no examples (they come with the questions)', async () => {
    const a = await newAccount(); made.push(a);
    expect(await prisma.recipe.count({ where: { restaurantId: a.restaurantId } })).toBe(0);
  });

  it('a pizzaria starts with pizzas, costed, and no low-stock alert', async () => {
    const a = await newAccount(); made.push(a);
    const res = await answer(a.userId, { ...answers, businessType: 'pizzaria', startWith: 'template' });
    expect(res.status).toBe(200);
    expect((await res.json()).template).toBe('pizzaria');
    const recipes = await prisma.recipe.findMany({ where: { restaurantId: a.restaurantId }, select: { name: true } });
    expect(recipes.map((r) => r.name)).toEqual(expect.arrayContaining(['Pizza muçarela', 'Pizza calabresa']));
    const menu = await prisma.menuItem.count({ where: { restaurantId: a.restaurantId } });
    expect(menu).toBeGreaterThan(recipes.length);
    const stats = await getDashboardStats(a.restaurantId);
    expect(stats.lowStock.value).toBe(0);
    expect(stats.recipes.value).toBe(recipes.length);
  });

  it('answering twice does not duplicate the examples', async () => {
    const a = await newAccount(); made.push(a);
    await answer(a.userId, { ...answers, businessType: 'hamburgueria', startWith: 'template' });
    const first = await prisma.recipe.count({ where: { restaurantId: a.restaurantId } });
    const again = await answer(a.userId, { ...answers, businessType: 'pizzaria', startWith: 'template' });
    expect((await again.json()).template).toBeNull();
    expect(await prisma.recipe.count({ where: { restaurantId: a.restaurantId } })).toBe(first);
  });

  it('"Começar em branco" creates nothing', async () => {
    const a = await newAccount(); made.push(a);
    await answer(a.userId, { ...answers, businessType: 'japones', startWith: 'blank' });
    expect(await prisma.ingredient.count({ where: { restaurantId: a.restaurantId } })).toBe(0);
    expect(await prisma.menuItem.count({ where: { restaurantId: a.restaurantId } })).toBe(0);
  });

  it('"Pular por enquanto" keeps the general example', async () => {
    const a = await newAccount(); made.push(a);
    const res = await answer(a.userId, { skip: true });
    expect((await res.json()).template).toBe('restaurantes');
    const names = (await prisma.recipe.findMany({ where: { restaurantId: a.restaurantId }, select: { name: true } })).map((r) => r.name);
    expect(names).toContain('Prato executivo de frango');
  });

  it('saves the address when given, and accepts it left for later', async () => {
    const a = await newAccount(); made.push(a);
    await answer(a.userId, {
      ...answers, businessType: 'marmitaria', startWith: 'blank',
      address: { zipCode: '13201005', street: 'Rua Barão de Jundiaí', number: '100', neighborhood: 'Centro', city: 'Jundiaí', state: 'SP' },
    });
    expect(await prisma.restaurant.findUnique({ where: { id: a.restaurantId }, select: { address: true, city: true, state: true, zipCode: true } }))
      .toEqual({ address: 'Rua Barão de Jundiaí, 100 - Centro', city: 'Jundiaí', state: 'SP', zipCode: '13201-005' });

    const b = await newAccount(); made.push(b);
    const res = await answer(b.userId, { ...answers, businessType: 'acai', startWith: 'blank', address: { zipCode: '', street: '' } });
    expect(res.status).toBe(200);
    expect((await res.json()).addressSaved).toBe(false);
  });

  it('a half-filled address is refused and nothing is created', async () => {
    const a = await newAccount(); made.push(a);
    const res = await answer(a.userId, { ...answers, businessType: 'bar', startWith: 'template', address: { zipCode: '13201005', street: 'Rua A' } });
    expect(res.status).toBe(400);
    expect(await prisma.recipe.count({ where: { restaurantId: a.restaurantId } })).toBe(0);
  });

  it('every business type template goes in without errors', async () => {
    for (const businessType of ['restaurantes', 'japones', 'lanchonete', 'doceria', 'marmitaria', 'acai', 'bar']) {
      const a = await newAccount(); made.push(a);
      const res = await answer(a.userId, { ...answers, businessType, startWith: 'template' });
      expect([businessType, (await res.json()).template]).toEqual([businessType, businessType]);
    }
  });
});
