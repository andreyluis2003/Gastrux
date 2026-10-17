// @ts-nocheck
/** Onboarding progress for the chat and the AI tool (spec 2026-10-17 ia-implantacao §3) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { GET } from '../../../app/api/ai/onboarding/route';
import { runTool } from '../../../lib/ai/tools/run';
import { toolsFor } from '../../../lib/ai/tools/defs';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const as = (u) => { const s = { user: u, expires: '2099-01-01' }; getServerSession.mockResolvedValue(s); getServerSessionNext.mockResolvedValue(s); };

describe('onboarding progress', () => {
  let rid, owner, cook, ids = [];
  beforeAll(async () => {
    const o = await prisma.user.create({ data: { email: `aio-o-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } });
    rid = (await prisma.restaurant.create({ data: { name: `Aio ${tag}`, ownerId: o.id, status: 'ACTIVE' } })).id;
    await prisma.user.update({ where: { id: o.id }, data: { currentRestaurantId: rid } });
    const c = await prisma.user.create({ data: { email: `aio-c-${tag}@gastrux.test`, name: 'Zé', password: 'x', role: 'COOK', currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: c.id, role: 'COOK', permissions: [], acceptedAt: new Date() } });
    owner = { id: o.id, email: o.email, role: 'OWNER' }; cook = { id: c.id, email: c.email, role: 'COOK' }; ids = [o.id, c.id];
  });
  afterAll(async () => {
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.deleteMany({ where: { id: { in: ids } } }); } catch {}
  });

  it('owner gets the progress without calling the AI; cook gets 403', async () => {
    as(owner);
    const body = await (await GET()).json();
    expect(body).toMatchObject({ active: true, total: 6, next: { key: 'caixa' } });
    as(cook);
    expect((await GET()).status).toBe(403);
  });

  it('progresso_implantacao: managers only, returns the steps', async () => {
    expect(toolsFor('COOK').map((t) => t.name)).not.toContain('progresso_implantacao');
    const r = await runTool({ userId: owner.id, restaurantId: rid, role: 'OWNER' }, 'progresso_implantacao', {});
    expect(r.ok).toBe(true);
    expect(r.data.etapas.map((e) => e.chave)).toContain('mesas');
    expect(r.data.proxima).toMatchObject({ chave: 'caixa' });
    const denied = await runTool({ userId: cook.id, restaurantId: rid, role: 'COOK' }, 'progresso_implantacao', {});
    expect(denied).toMatchObject({ ok: false, denied: true });
  });
});
