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

  // Homolog 2026-10-17: the AI asked the owner where to start the tables, and drafted a waiter a Starter plan can never take
  it('progresso_implantacao shows the tables there are (example ones marked) and the users the plan allows', async () => {
    const s = await prisma.tableSection.create({ data: { restaurantId: rid, name: 'Salão principal', capacity: 40 } });
    await prisma.table.create({ data: { restaurantId: rid, sectionId: s.id, number: 1, capacity: 4, description: 'Mesa de exemplo' } });
    await prisma.table.create({ data: { restaurantId: rid, sectionId: s.id, number: 7, capacity: 4 } });
    const r = await runTool({ userId: owner.id, restaurantId: rid, role: 'OWNER' }, 'progresso_implantacao', {});
    expect(r.data.mesas).toEqual([{ area: 'Salão principal', numeros: [1, 7], exemplo: [1] }]);
    expect(r.data.usuarios).toEqual({ usados: 1, limite: 1 });
  });

  it('propor_equipe on a full plan answers why instead of drafting', async () => {
    const r = await runTool({ userId: owner.id, restaurantId: rid, role: 'OWNER' }, 'propor_equipe', { pessoas: [{ nome: 'João', email: 'joao@x.test', papel: 'CAIXA' }] }, new Date(), {});
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/permite 1 usuário/);
    expect(r.error).toMatch(/Minha assinatura/);
    expect(await prisma.aiDraft.count({ where: { restaurantId: rid } })).toBe(0);
  });
});
