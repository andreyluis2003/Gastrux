// @ts-nocheck
/** Gastrux order API keys (plan 2026-10-23 api-de-pedidos, Task 2) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { GET as LIST, POST as CREATE } from '../../../app/api/admin/integrations/api-keys/route';
import { PATCH as SET_CALLBACK, DELETE as REVOKE } from '../../../app/api/admin/integrations/api-keys/[id]/route';
import { authenticateOrderApiKey } from '../../../lib/delivery-orders/api-keys';
import { isSafeCallbackUrl } from '../../../lib/delivery-orders/callback-url';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const as = (u) => {
  const s = { user: u, expires: '2099-01-01' };
  (getServerSession as jest.Mock).mockResolvedValue(s);
  (getServerSessionNext as jest.Mock).mockResolvedValue(s);
};
const req = (method, body?) => new NextRequest('http://x', { method, body: body ? JSON.stringify(body) : undefined });
let seq = 0;

async function setup(tier) {
  const o = await prisma.user.create({ data: { email: `oak-o-${seq++}-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } });
  const rid = (await prisma.restaurant.create({ data: { name: `Oak ${seq++} ${tag}`, ownerId: o.id, status: 'ACTIVE', subscriptionTier: tier, subscriptionStatus: 'active', isInternal: false } })).id;
  await prisma.user.update({ where: { id: o.id }, data: { currentRestaurantId: rid } });
  const staff = {};
  for (const role of ['MANAGER', 'CASHIER', 'COOK']) {
    const u = await prisma.user.create({ data: { email: `oak-${role}-${seq++}-${tag}@gastrux.test`, name: role, password: 'x', role, currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: u.id, role, permissions: [], acceptedAt: new Date() } });
    staff[role] = { id: u.id, email: u.email, role };
  }
  return { rid, owner: { id: o.id, email: o.email, role: 'OWNER' }, ...staff, userIds: [o.id, ...Object.values(staff).map((x: any) => x.id)] };
}

describe('order API keys', () => {
  let a, b, s;
  beforeAll(async () => { a = await setup('pro'); b = await setup('business'); s = await setup('starter'); }, 60000);
  afterAll(async () => {
    for (const x of [a, b, s]) {
      try { await prisma.auditLog.deleteMany({ where: { restaurantId: x.rid } }); } catch {}
      try { await prisma.restaurant.deleteMany({ where: { id: x.rid } }); } catch {}
      try { await prisma.user.deleteMany({ where: { id: { in: x.userIds } } }); } catch {}
    }
  });

  it('the owner creates a key: shown once, only its hash is stored, the list shows the prefix', async () => {
    as(a.owner);
    const res = await CREATE(req('POST', { name: 'Site da loja' }));
    expect(res.status).toBe(201);
    const { key, prefix, id } = await res.json();
    expect(key).toMatch(/^gx_live_[A-Za-z0-9]{32}$/);
    expect(prefix).toBe(key.slice(0, 12));
    const row = await prisma.orderApiKey.findUnique({ where: { id } });
    expect(row.keyHash).toBe(crypto.createHash('sha256').update(key).digest('hex'));
    expect(JSON.stringify(row)).not.toContain(key);
    const list = await (await LIST(req('GET'))).json();
    expect(JSON.stringify(list)).not.toContain(key);
    expect(list.keys).toEqual([expect.objectContaining({ id, name: 'Site da loja', prefix })]);
    expect(await prisma.deliveryIntegration.count({ where: { restaurantId: a.rid, platform: 'gastrux_api' } })).toBe(1);
    // A second key reuses the restaurant's integration
    await CREATE(req('POST', { name: 'Bot' }));
    expect(await prisma.deliveryIntegration.count({ where: { restaurantId: a.rid, platform: 'gastrux_api' } })).toBe(1);
  });

  it('authenticates by the key; revoked, empty or foreign-format keys are refused', async () => {
    as(a.owner);
    const { key, id } = await (await CREATE(req('POST', { name: 'Integração' }))).json();
    const ok = await authenticateOrderApiKey(`Bearer ${key}`);
    expect(ok).toMatchObject({ restaurantId: a.rid, apiKeyId: id });
    expect((await prisma.orderApiKey.findUnique({ where: { id } })).lastUsedAt).not.toBeNull();
    for (const h of [null, '', 'Bearer ', `Bearer ${key}x`, `Token ${key}`, 'Bearer gx_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx']) expect(await authenticateOrderApiKey(h)).toBeNull();
    expect((await REVOKE(req('DELETE'), { params: { id } })).status).toBe(200);
    expect(await authenticateOrderApiKey(`Bearer ${key}`)).toBeNull();
  });

  it('only owner and manager; another restaurant\'s key is not found; no plan, no key', async () => {
    as(a.owner);
    const { id } = await (await CREATE(req('POST', { name: 'Da loja A' }))).json();
    for (const who of [a.CASHIER, a.COOK]) {
      as(who);
      expect((await LIST(req('GET'))).status).toBe(403);
      expect((await CREATE(req('POST', { name: 'x' }))).status).toBe(403);
    }
    as(b.MANAGER);
    expect((await REVOKE(req('DELETE'), { params: { id } })).status).toBe(404);
    expect((await SET_CALLBACK(req('PATCH', { callbackUrl: 'https://example.com/hook' }), { params: { id } })).status).toBe(404);
    as(s.owner);
    const refused = await CREATE(req('POST', { name: 'x' }));
    expect(refused.status).toBe(403);
    expect((await refused.json()).upgradeUrl).toBe('/pricing');
  });

  it('the callback address: https on the internet only', async () => {
    as(a.MANAGER);
    const { id } = await (await CREATE(req('POST', { name: 'Com aviso' }))).json();
    for (const url of ['http://localhost:3000/x', 'https://localhost/x', 'https://10.0.0.5/x', 'https://192.168.1.10/x', 'https://172.16.0.1/x', 'https://169.254.169.254/', 'https://127.0.0.1/x', 'http://example.com/x', 'https://loja.local/x', 'ftp://example.com']) {
      expect([url, (await SET_CALLBACK(req('PATCH', { callbackUrl: url }), { params: { id } })).status]).toEqual([url, 400]);
    }
    expect(await isSafeCallbackUrl('https://[::1]/x')).toBe(false);
    const saved = await SET_CALLBACK(req('PATCH', { callbackUrl: 'https://1.1.1.1/hook' }), { params: { id } });
    expect(saved.status).toBe(200);
    const row = await prisma.orderApiKey.findUnique({ where: { id } });
    expect(row.callbackUrl).toBe('https://1.1.1.1/hook');
    expect(row.callbackSecret).toMatch(/^[0-9a-f]{64}$/);
    expect((await SET_CALLBACK(req('PATCH', { callbackUrl: null }), { params: { id } })).status).toBe(200);
    expect((await prisma.orderApiKey.findUnique({ where: { id } })).callbackUrl).toBeNull();
    expect(await prisma.auditLog.count({ where: { restaurantId: a.rid, entityType: 'OrderApiKey' } })).toBeGreaterThanOrEqual(3);
  });
});
