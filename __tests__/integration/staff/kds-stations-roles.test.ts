// @ts-nocheck
/** Kitchen stations: the owner and the manager configure them; the cook and the cashier do not (2026-10-26) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { POST as create } from '../../../app/api/kds/stations/route';
import { PUT as update, DELETE as remove } from '../../../app/api/kds/stations/[id]/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
let seq = 0;
const as = (u) => {
  const s = { user: u, expires: '2099-01-01' };
  (getServerSession as jest.Mock).mockResolvedValue(s);
  (getServerSessionNext as jest.Mock).mockResolvedValue(s);
};
const post = (body) => create(new NextRequest('http://x', { method: 'POST', body: JSON.stringify(body) }));
const put = (id, body) => update(new NextRequest('http://x', { method: 'PUT', body: JSON.stringify(body) }), { params: { id } });
const del = (id) => remove(new NextRequest('http://x', { method: 'DELETE' }), { params: { id } });

describe('kitchen stations: who configures', () => {
  const users = [];
  let rid, rid2, owner, manager, cook, cashier, otherManager;
  const member = async (r, role, globalRole = role) => {
    const u = await prisma.user.create({ data: { email: `kst-${seq++}-${tag}@gastrux.test`, name: role, password: 'x', role: globalRole, currentRestaurantId: r } });
    users.push(u.id);
    await prisma.restaurantUser.create({ data: { restaurantId: r, userId: u.id, role, permissions: [], acceptedAt: new Date() } });
    return { id: u.id, email: u.email, role: globalRole };
  };
  beforeAll(async () => {
    const o = await prisma.user.create({ data: { email: `kst-o-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } });
    users.push(o.id);
    rid = (await prisma.restaurant.create({ data: { name: `Kst ${tag}`, ownerId: o.id, status: 'ACTIVE', subscriptionTier: 'business' } })).id;
    rid2 = (await prisma.restaurant.create({ data: { name: `Kst2 ${tag}`, ownerId: o.id, status: 'ACTIVE', subscriptionTier: 'business' } })).id;
    await prisma.user.update({ where: { id: o.id }, data: { currentRestaurantId: rid } });
    owner = { id: o.id, email: o.email, role: 'OWNER' };
    manager = await member(rid, 'MANAGER');
    cook = await member(rid, 'COOK');
    cashier = await member(rid, 'CASHIER');
    // A manager of another restaurant whose global role says OWNER: the restaurant role decides
    otherManager = await member(rid2, 'MANAGER', 'OWNER');
  });
  afterAll(async () => {
    try { await prisma.kitchenStation.deleteMany({ where: { restaurantId: { in: [rid, rid2] } } }); } catch {}
    try { await prisma.restaurant.deleteMany({ where: { id: { in: [rid, rid2] } } }); } catch {}
    try { await prisma.user.deleteMany({ where: { id: { in: users } } }); } catch {}
  });

  it('the manager creates, edits and removes a station', async () => {
    as(manager);
    const res = await post({ name: 'Grelha', displayColor: '#ff0000' });
    expect(res.status).toBe(201);
    const station = await res.json();
    expect((await put(station.id, { name: 'Grelha 2' })).status).toBe(200);
    expect((await prisma.kitchenStation.findUnique({ where: { id: station.id } })).name).toBe('Grelha 2');
    expect((await del(station.id)).status).toBe(200);
    expect((await prisma.kitchenStation.findUnique({ where: { id: station.id } })).active).toBe(false);
  });

  it('the owner still does', async () => {
    as(owner);
    expect((await post({ name: 'Fritura' })).status).toBe(201);
  });

  it('the cook and the cashier cannot; a manager of another restaurant cannot touch this one', async () => {
    as(owner);
    const station = await (await post({ name: 'Bebidas' })).json();
    for (const u of [cook, cashier]) {
      as(u);
      expect((await post({ name: 'X' })).status).toBe(403);
      expect((await put(station.id, { name: 'Y' })).status).toBe(403);
      expect((await del(station.id)).status).toBe(403);
    }
    as(otherManager);
    expect((await put(station.id, { name: 'Z' })).status).toBe(404);
    expect((await del(station.id)).status).toBe(404);
    expect((await prisma.kitchenStation.findUnique({ where: { id: station.id } })).name).toBe('Bebidas');
  });
});
