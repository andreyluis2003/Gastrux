// @ts-nocheck
/**
 * Who registers suppliers (owner decision 2026-10-09): owner, manager and cook (in a small restaurant
 * the cook does the buying); the cashier neither sees nor registers them. The routes used to block
 * the cook and let the cashier in, by the user's global role.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { GET as LIST, POST as CREATE } from '../../../app/api/suppliers/route';
import { PUT as UPDATE } from '../../../app/api/suppliers/[id]/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const as = (u: { id: string; email: string; role: string }) => {
  const s = { user: u, expires: '2099-01-01' };
  (getServerSession as jest.Mock).mockResolvedValue(s);
  (getServerSessionNext as jest.Mock).mockResolvedValue(s);
};
const req = (method: string, body?: any) => new NextRequest('http://x/api/suppliers', { method, body: body ? JSON.stringify(body) : undefined });

describe('supplier register: owner, manager and cook', () => {
  let rid: string;
  const users: Record<string, { id: string; email: string; role: string }> = {};
  beforeAll(async () => {
    const owner = await prisma.user.create({ data: { email: `sa-owner-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } });
    rid = (await prisma.restaurant.create({ data: { name: `Sa ${tag}`, ownerId: owner.id, status: 'ACTIVE' } })).id;
    for (const role of ['OWNER', 'COOK', 'CASHIER']) {
      const u = role === 'OWNER' ? owner : await prisma.user.create({ data: { email: `sa-${role.toLowerCase()}-${tag}@gastrux.test`, name: role, password: 'x', role } });
      await prisma.user.update({ where: { id: u.id }, data: { currentRestaurantId: rid } });
      await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: u.id, role, permissions: [], acceptedAt: new Date() } });
      users[role] = { id: u.id, email: u.email, role };
    }
  }, 60000);
  afterAll(async () => {
    try { await prisma.supplier.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.deleteMany({ where: { id: { in: Object.values(users).map((u) => u.id) } } }); } catch {}
  });

  it('the cook registers, lists and edits a supplier', async () => {
    as(users.COOK);
    const created = await CREATE(req('POST', { code: `C${tag}`, name: 'Hortifruti' }));
    expect(created.status).toBeLessThan(300);
    const { id } = await created.json();
    expect((await LIST(req('GET'))).status).toBe(200);
    const updated = await UPDATE(new NextRequest('http://x', { method: 'PUT', body: JSON.stringify({ name: 'Hortifruti do Zé' }) }), { params: { id } });
    expect(updated.status).toBe(200);
  });

  it('the cashier neither lists nor registers', async () => {
    as(users.CASHIER);
    expect((await LIST(req('GET'))).status).toBe(403);
    expect((await CREATE(req('POST', { code: `X${tag}`, name: 'Bebidas' }))).status).toBe(403);
  });

  it('a missing code or name is refused in Portuguese', async () => {
    as(users.OWNER);
    const res = await CREATE(req('POST', { name: 'Sem código' }));
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toMatch(/Código e nome/);
  });
});
