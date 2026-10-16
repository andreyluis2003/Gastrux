// @ts-nocheck
/** The recipe flag "Contar na contagem do dia" (spec 2026-10-16, 4.1) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { PUT } from '../../../app/api/recipes/[id]/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const as = (u) => {
  const s = { user: u, expires: '2099-01-01' };
  (getServerSession as jest.Mock).mockResolvedValue(s);
  (getServerSessionNext as jest.Mock).mockResolvedValue(s);
};

describe('recipe flag dailyCount', () => {
  let rid, owner, recipe;
  beforeAll(async () => {
    const o = await prisma.user.create({ data: { email: `dcf-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } });
    rid = (await prisma.restaurant.create({ data: { name: `Dcf ${tag}`, ownerId: o.id, status: 'ACTIVE' } })).id;
    await prisma.user.update({ where: { id: o.id }, data: { currentRestaurantId: rid } });
    owner = { id: o.id, email: o.email, role: 'OWNER' };
    recipe = await prisma.recipe.create({ data: { restaurantId: rid, code: `C${tag}`, name: 'Coxinha', baseYield: 1, yieldUnit: 'un', portionUnit: 'un' } });
  });
  afterAll(async () => {
    try { await prisma.restaurant.deleteMany({ where: { id: rid } }); } catch {}
    try { await prisma.user.deleteMany({ where: { id: owner.id } }); } catch {}
  });

  it('turns on and off; leaving it out keeps it', async () => {
    as(owner);
    const base = { name: 'Coxinha', baseYield: 1, yieldUnit: 'un', portionSize: 1, portionUnit: 'un', prepTimeMinutes: 0, yieldLossFactor: 0 };
    const put = (body) => PUT(new NextRequest('http://x', { method: 'PUT', body: JSON.stringify(body) }), { params: { id: recipe.id } });
    expect((await put({ ...base, dailyCount: true })).status).toBe(200);
    expect((await prisma.recipe.findUnique({ where: { id: recipe.id } })).dailyCount).toBe(true);
    expect((await put(base)).status).toBe(200);
    expect((await prisma.recipe.findUnique({ where: { id: recipe.id } })).dailyCount).toBe(true);
    expect((await put({ ...base, dailyCount: false })).status).toBe(200);
    expect((await prisma.recipe.findUnique({ where: { id: recipe.id } })).dailyCount).toBe(false);
  });
});
